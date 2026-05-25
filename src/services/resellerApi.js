/**
 * Reseller hosting-panel HTTP API client (Hostheaven / SomaniOne pattern).
 *
 * One instance is bound to a single (baseUrl, email, password) tuple — i.e.
 * one company configuration. JWT tokens are cached in-memory per
 * (baseUrl|email) so we don't re-login on every action; the cache is shared
 * across instances via a module-level Map so that repeated requests within
 * the same Node process reuse the token.
 *
 * Implements only the verbs the order-management UI needs:
 *   - login()
 *   - findVmByIp(ip)
 *   - getVmDetails(vmId)
 *   - getVmIsos(vmId)            (resolves zone first, then lists ISOs)
 *   - getVmMetrics(vmId)         (drives power-state UI)
 *   - getVmLockStatus(vmId)
 *   - start / stop / restart     (POST .../vms/{id}/control?action=...)
 *   - rebuild(vmId, isoId)       (POST .../vms/{id}/rebuild?isoId=...)
 *   - regenerateMac(vmId)        (POST .../vms/{id}/mac/regenerate)
 *
 * The {userId} in path params is documented as ignored by the upstream
 * backend (auth comes from the JWT). We hardcode it to "0" so the URL is
 * always well-formed.
 */

const TOKEN_CACHE = new Map(); // key: `${baseUrl}|${email}` → { token, expiresAt }
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // refresh after 23h to stay clear of typical 24h JWT exp

function trimSlash(s) {
  return (s || '').replace(/\/+$/, '');
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

  async _login() {
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
    return token;
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
   * Authenticated request with one automatic re-login on 401.
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
    if (res.status === 401) {
      // Token rejected - force re-login once.
      TOKEN_CACHE.delete(this._cacheKey);
      ({ res, parsed } = await attempt(true));
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

  /**
   * Walk paginated overview pages searching for a VM whose IP equals `ip`
   * (port stripped). Returns { vmId, ip, raw } or null.
   */
  async findVmByIp(ip, { maxPages = 20, pageSize = 50 } = {}) {
    const cleanIp = String(ip || '').split(':')[0].trim();
    if (!cleanIp) return null;

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
          return {
            vmId: String(vmId),
            ip: cleanIp,
            serverName: o?.serverName || o?.vmName || o?.hostname || '',
            raw: o,
          };
        }
      }
      page++;
      if (totalPages <= page) break;
    }
    return null;
  }

  async getVmDetails(vmId) {
    return this._request(`/api/users/orders/${encodeURIComponent(vmId)}/details`);
  }

  async getZones() {
    return this._request('/api/users/zones');
  }

  async getZoneIsos(zoneId) {
    return this._request(`/api/users/zones/${encodeURIComponent(zoneId)}/isos`);
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

  async getVmLockStatus(vmId) {
    return this._request(`/api/vms/${encodeURIComponent(vmId)}/lock-status`);
  }

  async control(vmId, action) {
    const allowed = ['start', 'stop', 'reboot', 'pause', 'hibernate', 'resume'];
    if (!allowed.includes(action)) {
      throw new Error(`ResellerApi.control: unsupported action '${action}'`);
    }
    const userId = 0; // path is ignored by upstream — JWT-derived
    return this._request(
      `/api/users/${userId}/vms/${encodeURIComponent(vmId)}/control?action=${encodeURIComponent(action)}`,
      { method: 'POST' }
    );
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
    if (!raw) return 'unknown';
    if (typeof raw === 'object') {
      const candidate = raw.status || raw.state || raw.power || raw.running;
      return ResellerApi.normalizePowerState(candidate);
    }
    if (typeof raw === 'number') return raw === 1 ? 'running' : 'stopped';
    const s = String(raw).toLowerCase().trim();
    if (['running', 'on', 'online', 'started', 'active', '1'].includes(s)) return 'running';
    if (['stopped', 'off', 'offline', 'shutdown', 'shutoff', '0'].includes(s)) return 'stopped';
    if (['suspended', 'paused'].includes(s)) return 'suspended';
    if (['installing', 'rebooting', 'starting', 'stopping', 'busy', 'pending'].includes(s)) return 'busy';
    return s || 'unknown';
  }
}

module.exports = ResellerApi;
module.exports.ResellerApi = ResellerApi;
module.exports.ResellerApiError = ResellerApiError;
module.exports.default = ResellerApi;
