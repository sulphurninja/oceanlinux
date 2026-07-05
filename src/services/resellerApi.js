/**
 * Reseller hosting-panel HTTP API client (Hostheaven / SomaniOne pattern).
 *
 * One instance is bound to a single (baseUrl, email, password) tuple — i.e.
 * one company configuration. JWT tokens are cached in-memory per
 * (baseUrl|email) so we don't re-login on every action; the cache is shared
 * across instances via a module-level Map so that repeated requests within
 * the same Node process reuse the token.
 *
 * UserSide.pdf / SomaniOne panel API surface:
 *   Auth: login(), test()
 *   Catalog: getZones(), getZoneIsos(), getPricingCatalog(), getUpgradeOptions()
 *   Wallet: getWallet(), getWalletLogs(), walletTopUp()
 *   Buy: createVm()              (POST /api/users/vms/create?gateway=)
 *   Renew: calculateRenewal(), upgradeRenew()
 *   Manage: findVmByIp(), getVmDetails(), getVmMetrics(), getVmStorage()
 *           start/stop/restart, rebuild(), changePassword(), regenerateMac()
 *           reconfigureNetwork(), getVmLockStatus(), getAuditLogs()
 *
 * The {userId} in path params is documented as ignored by the upstream
 * backend (auth comes from the JWT). We hardcode it to "0" so the URL is
 * always well-formed.
 */

const TOKEN_CACHE = new Map(); // key: `${baseUrl}|${email}` → { token, expiresAt }
const LOGIN_INFLIGHT = new Map(); // key → Promise<token>; de-dupes concurrent re-logins
const VM_IP_CACHE = new Map(); // key: `${baseUrl}|${email}|${ip}` → { found, at }
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // refresh after 23h to stay clear of typical 24h JWT exp
const VM_IP_CACHE_TTL_MS = 10 * 60 * 1000;

function trimSlash(s) {
  return (s || '').replace(/\/+$/, '');
}

/**
 * Detect whether an upstream response represents a token-auth failure (so
 * we should drop the cached JWT and re-login). Goes beyond plain HTTP 401:
 * Spring Security backends often return 403 for expired JWTs, and some
 * panels surface JWT errors as 5xx with the message in the body. Also
 * watches for 419 (CSRF/Laravel) and 440 (IIS).
 *
 * Without this, a token rejected with anything but 401 leaves the cached
 * JWT untouched and the admin has to manually re-login from /admin/companies.
 */
function isAuthFailure(res, parsed) {
  if (!res) return false;
  const code = res.status;
  if (code === 401 || code === 403 || code === 419 || code === 440) return true;
  if (code < 400) return false;
  const text = typeof parsed === 'string'
    ? parsed
    : (parsed && (parsed.message || parsed.error || parsed.detail)) || '';
  if (typeof text !== 'string' || !text) return false;
  const t = text.toLowerCase();
  return (
    t.includes('jwt') ||
    t.includes('token') ||
    t.includes('unauthorized') ||
    t.includes('not authenticated') ||
    t.includes('session expired') ||
    t.includes('signature') ||
    t.includes('expired')
  );
}

function deriveResellerDomain(baseUrl, override) {
  if (override && override.trim()) return override.trim();
  try {
    return new URL(baseUrl).host;
  } catch {
    return '';
  }
}

class ResellerApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ResellerApiError';
    this.status = status;
    this.body = body;
  }
}

class ResellerApi {
  /**
   * @param {Object} cfg
   * @param {string} cfg.baseUrl         e.g. https://vps.hostheaven.in
   * @param {string} cfg.email
   * @param {string} cfg.password
   * @param {string} [cfg.resellerDomain]  Override for X-Reseller-Domain
   * @param {string} [cfg.label]
   * @param {number} [cfg.timeoutMs=20000]
   */
  constructor(cfg = {}) {
    this.baseUrl = trimSlash(cfg.baseUrl || '');
    this.email = (cfg.email || '').trim();
    this.password = cfg.password || '';
    this.resellerDomain = deriveResellerDomain(this.baseUrl, cfg.resellerDomain);
    this.label = cfg.label || '';
    this.timeoutMs = Number(cfg.timeoutMs || 20000);

    if (!this.baseUrl || !this.email || !this.password) {
      throw new Error('ResellerApi: baseUrl, email and password are all required');
    }

    this._cacheKey = `${this.baseUrl}|${this.email.toLowerCase()}`;
  }

  // ----------------------------- internals -----------------------------

  _headers({ auth = true, token = null } = {}) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.resellerDomain) headers['X-Reseller-Domain'] = this.resellerDomain;
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async _rawFetch(path, { method = 'GET', body, headers, signal } = {}) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const init = {
      method,
      headers: { ...headers },
      signal,
    };
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(url, init);
    let parsed = null;
    const text = await res.text();
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { res, parsed, text };
  }

  async _withTimeout(fn) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await fn(ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Login against upstream and cache the JWT. Concurrent calls are
   * de-duped via LOGIN_INFLIGHT — under load (e.g. 10 customers smashing
   * Start at the same time after token expiry), we issue exactly ONE
   * upstream login request instead of N, which keeps us under the panel's
   * rate limits.
   */
  async _login() {
    const inflight = LOGIN_INFLIGHT.get(this._cacheKey);
    if (inflight) return inflight;

    const p = (async () => {
      const { res, parsed } = await this._withTimeout(signal =>
        this._rawFetch('/api/login', {
          method: 'POST',
          headers: this._headers({ auth: false }),
          body: { email: this.email, password: this.password },
          signal,
        })
      );
      if (!res.ok) {
        const msg = (parsed && (parsed.message || parsed.error)) || `HTTP ${res.status}`;
        throw new ResellerApiError(`Reseller login failed: ${msg}`, {
          status: res.status,
          body: parsed,
        });
      }
      const token = parsed?.token || parsed?.accessToken || parsed?.jwt;
      if (!token) {
        throw new ResellerApiError('Reseller login returned no token', { status: 200, body: parsed });
      }
      TOKEN_CACHE.set(this._cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
      console.log(`[ResellerApi] 🔐 Logged in to ${this.baseUrl} as ${this.email} (token cached for 23h)`);
      return token;
    })().finally(() => {
      // Always clear the inflight slot — successful or not — so the next
      // request gets a fresh attempt rather than caching a rejected promise.
      LOGIN_INFLIGHT.delete(this._cacheKey);
    });

    LOGIN_INFLIGHT.set(this._cacheKey, p);
    return p;
  }

  async _ensureToken({ force = false } = {}) {
    if (!force) {
      const entry = TOKEN_CACHE.get(this._cacheKey);
      if (entry && entry.token && entry.expiresAt > Date.now()) {
        return entry.token;
      }
    }
    return await this._login();
  }

  /**
   * Authenticated request with one automatic re-login when upstream
   * indicates the JWT is expired/invalid. Detection is intentionally
   * broad — see `isAuthFailure` — because Hostheaven/SomaniOne style
   * Spring Security backends frequently return 403 (not 401) for expired
   * tokens, and some 5xx-with-message responses too.
   */
  async _request(path, opts = {}) {
    const attempt = async (force) => {
      const token = await this._ensureToken({ force });
      const headers = this._headers({ auth: true, token });
      if (opts.headers) Object.assign(headers, opts.headers);
      return await this._withTimeout(signal =>
        this._rawFetch(path, {
          method: opts.method || 'GET',
          body: opts.body,
          headers,
          signal,
        })
      );
    };

    let { res, parsed } = await attempt(false);
    if (isAuthFailure(res, parsed)) {
      console.warn(
        `[ResellerApi] ⚠️ Auth failure (${res.status}) on ${opts.method || 'GET'} ${path} — ` +
        `dropping cached JWT and forcing re-login (${this.email}@${this.baseUrl})`
      );
      TOKEN_CACHE.delete(this._cacheKey);
      try {
        ({ res, parsed } = await attempt(true));
        if (res.ok) {
          console.log(`[ResellerApi] ✅ Self-healed: ${opts.method || 'GET'} ${path} succeeded after auto re-login`);
        }
      } catch (reloginErr) {
        // _login itself failed (most likely bad creds). Surface a clear
        // ResellerApiError so the upstream UI can show "credentials need
        // updating in /admin/companies" rather than a generic 500.
        throw new ResellerApiError(
          `Reseller auto re-login failed: ${reloginErr.message}`,
          { status: reloginErr.status || 502, body: reloginErr.body }
        );
      }
    }

    if (!res.ok) {
      const msg = (parsed && typeof parsed === 'object' && (parsed.message || parsed.error)) ||
        (typeof parsed === 'string' ? parsed.slice(0, 200) : `HTTP ${res.status}`);
      throw new ResellerApiError(`Reseller API ${opts.method || 'GET'} ${path}: ${msg}`, {
        status: res.status,
        body: parsed,
      });
    }
    return parsed;
  }

  // ----------------------------- public API -----------------------------

  async login() {
    return this._ensureToken({ force: true });
  }

  /** Validate creds without throwing — returns {ok, message}. */
  async test() {
    try {
      const token = await this._ensureToken({ force: true });
      // Cheap follow-up call to make sure the token actually works for /api/users/*
      let zonesOk = true;
      let zonesError = null;
      try {
        await this._request('/api/users/zones');
      } catch (err) {
        zonesOk = false;
        zonesError = err.message;
      }
      return {
        ok: true,
        token: token.slice(0, 24) + '…',
        zonesOk,
        zonesError,
      };
    } catch (err) {
      return { ok: false, message: err.message, status: err.status };
    }
  }

  async getOrderOverviewPage(page = 0, size = 50) {
    const qs = new URLSearchParams({
      page: String(page),
      size: String(size),
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
    return this._request(`/api/users/orders/overview?${qs.toString()}`);
  }

  /** All IPs on an overview row (port stripped). */
  static extractOverviewRowIps(row) {
    return [
      row?.ip,
      row?.ipAddress,
      row?.primaryIp,
      row?.mainIp,
      ...(Array.isArray(row?.ips) ? row.ips : []),
    ]
      .filter(Boolean)
      .map((v) => String(v).split(':')[0].trim())
      .filter(Boolean);
  }

  /** Extract primary IP from an overview row (port stripped). */
  static extractOverviewRowIp(row) {
    return ResellerApi.extractOverviewRowIps(row)[0] || null;
  }

  /**
   * Fetch every overview page once and index VMs by IP.
   * Bulk expiry sync uses this instead of findVmByIp per inventory row (~14s each).
   */
  async buildVmIpIndex({ maxPages = 50, pageSize = 50 } = {}) {
    const byIp = new Map();
    let page = 0;
    let totalPages = 1;

    while (page < Math.min(totalPages, maxPages)) {
      const data = await this.getOrderOverviewPage(page, pageSize);
      const orders = data?.orders || data?.content || data?.items || [];
      totalPages = Number(data?.totalPages || data?.totalPage || 1) || 1;

      for (const row of orders) {
        const ips = ResellerApi.extractOverviewRowIps(row);
        if (ips.length === 0) continue;
        const vmId = row?.virtualMachineId || row?.vmId || row?.id || row?.vmid;
        if (vmId == null) continue;

        const entry = {
          vmId: String(vmId),
          ip: ips[0],
          serverName: row?.serverName || row?.vmName || row?.hostname || '',
          raw: row,
          expiryDate: ResellerApi.extractVmExpiryDate(row),
        };

        for (const ip of ips) {
          if (!byIp.has(ip)) byIp.set(ip, { ...entry, ip });
        }
      }

      page++;
      if (totalPages <= page) break;
    }

    return byIp;
  }

  /**
   * Walk paginated overview pages searching for a VM whose IP equals `ip`
   * (port stripped). Returns { vmId, ip, raw } or null.
   * Results are cached per panel account so status/stop polling does not
   * re-scan every order page on each request (~14s without cache).
   */
  async findVmByIp(ip, { maxPages = 20, pageSize = 50, skipCache = false } = {}) {
    const cleanIp = String(ip || '').split(':')[0].trim();
    if (!cleanIp) return null;

    const cacheKey = `${this._cacheKey}|${cleanIp}`;
    if (!skipCache) {
      const hit = VM_IP_CACHE.get(cacheKey);
      if (hit && hit.found && Date.now() - hit.at < VM_IP_CACHE_TTL_MS) {
        return hit.found;
      }
    }

    let page = 0;
    let totalPages = 1;
    while (page < Math.min(totalPages, maxPages)) {
      const data = await this.getOrderOverviewPage(page, pageSize);
      const orders = data?.orders || data?.content || data?.items || [];
      totalPages = Number(data?.totalPages || data?.totalPage || 1) || 1;

      for (const o of orders) {
        const candidates = [
          o?.ip,
          o?.ipAddress,
          o?.primaryIp,
          o?.mainIp,
          ...(Array.isArray(o?.ips) ? o.ips : []),
        ]
          .filter(Boolean)
          .map(v => String(v).split(':')[0].trim());

        if (candidates.includes(cleanIp)) {
          const vmId = o?.virtualMachineId || o?.vmId || o?.id || o?.vmid;
          if (vmId == null) continue;
          const found = {
            vmId: String(vmId),
            ip: cleanIp,
            serverName: o?.serverName || o?.vmName || o?.hostname || '',
            raw: o,
          };
          VM_IP_CACHE.set(cacheKey, { found, at: Date.now() });
          return found;
        }
      }
      page++;
      if (totalPages <= page) break;
    }
    return null;
  }

  /** Drop cached IP→VM mapping after power actions or when lookup may be stale. */
  invalidateVmIpCache(ip) {
    const cleanIp = String(ip || '').split(':')[0].trim();
    if (!cleanIp) return;
    VM_IP_CACHE.delete(`${this._cacheKey}|${cleanIp}`);
  }

  async getVmDetails(vmId) {
    return this._request(`/api/users/orders/${encodeURIComponent(vmId)}/details`);
  }

  /**
   * Pull the VM's current login/root password out of a details payload.
   * Hostheaven returns it on the order details endpoint as `password`, but we
   * probe a few common aliases so a panel-side rename doesn't silently break
   * the post-reinstall credential sync.
   */
  static extractVmPassword(details) {
    if (!details || typeof details !== 'object') return null;
    const candidate =
      details.password ||
      details.rootPassword ||
      details.root_password ||
      details.vmPassword ||
      details.loginPassword ||
      details.osPassword ||
      details?.credentials?.password ||
      null;
    const pwd = typeof candidate === 'string' ? candidate.trim() : '';
    return pwd || null;
  }

  /** Best-effort OS / template label from VM details (Hostheaven panel). */
  static extractVmOs(details) {
    if (!details || typeof details !== 'object') return '';
    const candidate =
      details.os ||
      details.osName ||
      details.operatingSystem ||
      details.operating_system ||
      details.template ||
      details.templateName ||
      details.isoName ||
      details.imageName ||
      details?.vm?.os ||
      '';
    return typeof candidate === 'string' ? candidate.trim() : '';
  }

  /** Login username when the panel exposes it; otherwise callers default by OS. */
  static extractVmUsername(details) {
    if (!details || typeof details !== 'object') return '';
    const candidate =
      details.username ||
      details.login ||
      details.loginUser ||
      details.rootUser ||
      details.root_user ||
      details?.credentials?.username ||
      '';
    return typeof candidate === 'string' ? candidate.trim() : '';
  }

  /**
   * Service expiry from overview row and/or VM details (Hostheaven: `expiresAt`).
   * Returns a Date or null.
   */
  static extractVmExpiryDate(...sources) {
    const { parseAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
    const keys = [
      'expiresAt',
      'expiryDate',
      'expiry',
      'validUntil',
      'validTill',
      'renewalDate',
      'endDate',
      'subscriptionEnd',
      'nextDueDate',
    ];

    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      for (const key of keys) {
        if (src[key] != null && src[key] !== '') {
          const d = parseAdvpsExpiryDate(src[key]);
          if (d) return d;
        }
      }
    }
    return null;
  }

  /**
   * Fetch the VM's current password from the details endpoint. Hostheaven
   * auto-rotates this on every rebuild/reinstall, so callers use this after a
   * reinstall to refresh the stored credential.
   */
  async getVmPassword(vmId) {
    const details = await this.getVmDetails(vmId);
    return ResellerApi.extractVmPassword(details);
  }

  async getZones() {
    return this._request('/api/users/zones');
  }

  async getZoneIsos(zoneId) {
    return this._request(`/api/users/zones/${encodeURIComponent(zoneId)}/isos`);
  }

  async getWallet() {
    return this._request('/api/wallet');
  }

  async getWalletLogs() {
    return this._request('/api/wallet/logs');
  }

  async walletTopUp(amount, { gateway = 'CASHFREE' } = {}) {
    const qs = new URLSearchParams({ gateway: String(gateway) });
    return this._request(`/api/wallet/top-up?${qs.toString()}`, {
      method: 'POST',
      body: { amount: Number(amount) },
    });
  }

  async getPaymentGateways() {
    return this._request('/api/user/payments/gateways');
  }

  /**
   * @param {'SHARED'|'DEDICATED'} planType
   * @param {'cpu'|'ram'|'disk'|'bandwidth'} resource
   */
  async getPricingCatalog(planType = 'SHARED', resource) {
    const pt = String(planType || 'SHARED').toLowerCase();
    const res = String(resource || '').toLowerCase();
    const allowed = ['cpu', 'ram', 'disk', 'bandwidth'];
    if (!allowed.includes(res)) {
      throw new Error(`ResellerApi.getPricingCatalog: invalid resource '${resource}'`);
    }
    const parsed = await this._request(`/api/pricing/${pt}/${res}`);
    return Array.isArray(parsed) ? parsed : (parsed?.items || parsed?.data || []);
  }

  async getUpgradeOptions(vmId) {
    return this._request(`/api/pricing/upgrades/${encodeURIComponent(vmId)}`);
  }

  async calculateRenewal(body) {
    return this._request('/api/billing/price/calculate-renewal', {
      method: 'POST',
      body,
    });
  }

  /**
   * Provision a new VM (UserSide.pdf §4). Uses company wallet when
   * useWalletBalance=true and gateway=WALLET.
   */
  async createVm(body, { gateway = 'WALLET' } = {}) {
    const qs = new URLSearchParams({ gateway: String(gateway) });
    return this._request(`/api/users/vms/create?${qs.toString()}`, {
      method: 'POST',
      body,
    });
  }

  /**
   * Renew or upgrade an existing VM subscription.
   * POST /api/vms/renew/{vmId}/upgrade-renew?gateway=
   */
  async upgradeRenew(vmId, body, { gateway = 'WALLET' } = {}) {
    const qs = new URLSearchParams({ gateway: String(gateway) });
    return this._request(
      `/api/vms/renew/${encodeURIComponent(vmId)}/upgrade-renew?${qs.toString()}`,
      { method: 'POST', body }
    );
  }

  async getVmStorage(vmId) {
    return this._request(`/api/users/vms/${encodeURIComponent(vmId)}/storage`);
  }

  async getAuditLogs({ limit = 8 } = {}) {
    const qs = new URLSearchParams({ limit: String(limit) });
    return this._request(`/api/users/audit-logs?${qs.toString()}`);
  }

  async changePassword(vmId, password) {
    const userId = 0;
    return this._request(
      `/api/users/${userId}/vms/${encodeURIComponent(vmId)}/password`,
      { method: 'PUT', body: { password: String(password) } }
    );
  }

  /**
   * Sum catalog unit prices for a VM spec (UserSide.pdf pricing IDs).
   * Used by live-stock to compare against GET /api/wallet balance.
   */
  async estimateMonthlyVmPrice({
    planType = 'SHARED',
    cpuPriceId,
    ramPriceId,
    diskPriceId,
    bandwidthPriceId,
    months = 1,
    quantity = 1,
  } = {}) {
    const findPrice = (list, id) => {
      const row = (list || []).find((x) => String(x.id) === String(id));
      return Number(row?.price ?? 0) || 0;
    };
    const pt = String(planType || 'SHARED').toUpperCase();
    const [cpuList, ramList, diskList, bwList] = await Promise.all([
      this.getPricingCatalog(pt, 'cpu'),
      this.getPricingCatalog(pt, 'ram'),
      this.getPricingCatalog(pt, 'disk'),
      this.getPricingCatalog(pt, 'bandwidth'),
    ]);
    const unitTotal =
      findPrice(cpuList, cpuPriceId) +
      findPrice(ramList, ramPriceId) +
      findPrice(diskList, diskPriceId) +
      findPrice(bwList, bandwidthPriceId);
    const estimatedMonthly = unitTotal * Number(months || 1) * Number(quantity || 1);
    return {
      unitTotal,
      estimatedMonthly,
      currency: 'INR',
      priceIds: { cpuPriceId, ramPriceId, diskPriceId, bandwidthPriceId },
    };
  }

  /** Count ACTIVE zones — no active zone means panel cannot provision. */
  async getActiveZoneCount() {
    const zones = await this.getZones();
    const list = Array.isArray(zones) ? zones : (zones?.zones || []);
    return list.filter((z) => String(z.status || '').toUpperCase() === 'ACTIVE').length;
  }

  /**
   * Reseller-admin unassigned VM pool (UserSide.pdf). Returns null when
   * forbidden — caller should fall back to wallet-based stock.
   */
  async getAdminAvailableVms() {
    try {
      const parsed = await this._request('/api/reseller/admin/vms/available');
      const rows = Array.isArray(parsed) ? parsed : (parsed?.vms || parsed?.items || []);
      return { ok: true, count: rows.length, rows };
    } catch (err) {
      if (err.status === 403 || err.status === 404) {
        return { ok: false, forbidden: true, count: null, message: err.message };
      }
      throw err;
    }
  }

  /** Resolve the VM's zoneId then return its ISO catalog. */
  async getVmIsos(vmId) {
    const det = await this.getVmDetails(vmId);
    const zoneId = det?.zoneId ?? det?.zone?.id;
    if (zoneId == null) {
      throw new ResellerApiError('Could not resolve zoneId for VM (cannot list ISOs)', {
        status: 0,
        body: det,
      });
    }
    const isos = await this.getZoneIsos(zoneId);
    return { zoneId, isos: Array.isArray(isos) ? isos : (isos?.isos || []) };
  }

  async getVmMetrics(vmId, { timeframe = 'hour' } = {}) {
    const qs = new URLSearchParams({ timeframe });
    return this._request(`/api/users/vms/${encodeURIComponent(vmId)}/metrics?${qs.toString()}`);
  }

  /** Order/subscription lifecycle values — not VM power. */
  static isOrderLifecycleStatus(value) {
    const s = String(value ?? '').toLowerCase().trim();
    return [
      'active', 'completed', 'pending', 'confirmed', 'paid', 'assigned',
      'provisioned', 'cancelled', 'canceled', 'expired', 'failed', 'processing',
    ].includes(s);
  }

  /**
   * Pull VM power from VM-specific fields only. Hostheaven overview rows often
   * expose `status: ACTIVE` for the *order*, which must not read as powered on.
   */
  static extractVmPowerCandidate(record) {
    if (!record || typeof record !== 'object') return null;

    const vmFields = [
      record.liveState,
      record.live_state,
      record.vmStatus,
      record.vm_status,
      record.powerStatus,
      record.power_status,
      record.virtualMachineStatus,
      record.machineStatus,
      record.runningStatus,
      record.running,
      record.power,
      record.powerState,
      record.virtualMachine?.liveState,
      record.virtualMachine?.status,
      record.virtualMachine?.state,
      record.virtualMachine?.powerStatus,
      record.virtualMachine?.vmStatus,
      record.vm?.liveState,
      record.vm?.status,
      record.vm?.state,
      record.vm?.powerStatus,
      record.current?.status,
      record.current?.state,
      record.current?.power,
      record.current?.data?.status,
      record.current?.data?.qmpstatus,
      record.current?.data?.state,
    ];

    for (const value of vmFields) {
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }

    // Generic status/state only when clearly a power value (not order lifecycle).
    for (const value of [record.status, record.state]) {
      if (value === undefined || value === null || value === '') continue;
      if (ResellerApi.isOrderLifecycleStatus(value)) continue;
      const probe = ResellerApi.normalizeVmPowerState(value);
      if (probe !== 'unknown') return value;
    }

    return null;
  }

  /**
   * VM power normalizer — does NOT treat order lifecycle "active" as running.
   */
  static normalizeVmPowerState(raw) {
    if (raw === undefined || raw === null || raw === '') return 'unknown';
    if (typeof raw === 'object') {
      const candidate = raw.status || raw.state || raw.power || raw.running || raw.vmStatus;
      return ResellerApi.normalizeVmPowerState(candidate);
    }
    if (typeof raw === 'boolean') return raw ? 'running' : 'stopped';
    if (typeof raw === 'number') return raw === 1 ? 'running' : 'stopped';
    const s = String(raw).toLowerCase().trim();
    if (ResellerApi.isOrderLifecycleStatus(s)) return 'unknown';
    if (['running', 'on', 'online', 'started', '1', 'powered_on', 'poweron'].includes(s)) return 'running';
    if (['stopped', 'off', 'offline', 'shutdown', 'shutoff', '0', 'powered_off', 'poweroff', 'unreachable'].includes(s)) return 'stopped';
    if (['suspended', 'paused'].includes(s)) return 'suspended';
    if (['installing', 'rebooting', 'starting', 'stopping', 'busy'].includes(s)) return 'busy';
    return 'unknown';
  }

  /**
   * Resolve live VM power — Proxmox metrics first (fast + accurate), then
   * overview liveState, then order details. Overview can lag 30–60s after stop.
   */
  async resolveVmPowerState(vmId, { overviewRaw = null } = {}) {
    const attempt = (record, source) => {
      if (!record) return null;
      const candidate = ResellerApi.extractVmPowerCandidate(record);
      if (candidate == null) return null;
      const powerState = ResellerApi.normalizeVmPowerState(candidate);
      if (powerState === 'unknown') return null;
      return { powerState, rawStatus: candidate, source };
    };

    try {
      const metrics = await this.getVmMetrics(vmId);
      const fromMetrics =
        attempt(metrics?.current?.data, 'metrics.data') ||
        attempt(metrics?.current, 'metrics.current') ||
        attempt(metrics, 'metrics');
      if (fromMetrics) return fromMetrics;
    } catch (err) {
      console.warn('[ResellerApi] getVmMetrics for power state failed:', err.message);
    }

    const fromOverview = attempt(overviewRaw, 'overview');
    if (fromOverview) return fromOverview;

    try {
      const details = await this.getVmDetails(vmId);
      const fromDetails = attempt(details, 'details');
      if (fromDetails) return fromDetails;
    } catch (err) {
      console.warn('[ResellerApi] getVmDetails for power state failed:', err.message);
    }

    return { powerState: 'unknown', rawStatus: null, source: 'none' };
  }

  async getVmLockStatus(vmId) {
    return this._request(`/api/vms/${encodeURIComponent(vmId)}/lock-status`);
  }

  async control(vmId, action) {
    const allowed = ['start', 'stop', 'reboot', 'pause', 'hibernate', 'resume'];
    if (!allowed.includes(action)) {
      throw new Error(`ResellerApi.control: unsupported action '${action}'`);
    }
    const userId = 0; // path is ignored by upstream — JWT-derived
    const parsed = await this._request(
      `/api/users/${userId}/vms/${encodeURIComponent(vmId)}/control?action=${encodeURIComponent(action)}`,
      { method: 'POST' }
    );
    const msg = typeof parsed?.message === 'string' ? parsed.message.toLowerCase() : '';
    if (parsed && parsed.success === false) {
      throw new ResellerApiError(parsed.message || `Reseller control '${action}' rejected`, {
        status: 502,
        body: parsed,
      });
    }
    if (msg.includes('fail') || msg.includes('error') || msg.includes('denied') || msg.includes('locked')) {
      throw new ResellerApiError(parsed?.message || `Reseller control '${action}' failed`, {
        status: 502,
        body: parsed,
      });
    }
    return parsed;
  }

  async start(vmId) { return this.control(vmId, 'start'); }
  async stop(vmId) { return this.control(vmId, 'stop'); }
  async restart(vmId) { return this.control(vmId, 'reboot'); }
  async reboot(vmId) { return this.control(vmId, 'reboot'); }

  async rebuild(vmId, isoId) {
    if (isoId == null || String(isoId).length === 0) {
      throw new Error('ResellerApi.rebuild: isoId is required');
    }
    const userId = 0;
    return this._request(
      `/api/users/${userId}/vms/${encodeURIComponent(vmId)}/rebuild?isoId=${encodeURIComponent(isoId)}`,
      { method: 'POST' }
    );
  }

  async regenerateMac(vmId) {
    return this._request(
      `/api/users/vms/${encodeURIComponent(vmId)}/mac/regenerate`,
      { method: 'POST' }
    );
  }

  async reconfigureNetwork(vmId) {
    return this._request(
      `/api/users/vms/${encodeURIComponent(vmId)}/reconfigure-network`,
      { method: 'POST' }
    );
  }

  /**
   * Translate the upstream metrics-current.status into our normalized power
   * state vocabulary used everywhere in the order page.
   */
  static normalizePowerState(raw) {
    return ResellerApi.normalizeVmPowerState(raw);
  }
}

module.exports = ResellerApi;
module.exports.ResellerApi = ResellerApi;
module.exports.ResellerApiError = ResellerApiError;
module.exports.default = ResellerApi;
