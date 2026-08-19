/**
 * Netbay reseller API HTTP client (https://api.netbayhosts.in).
 *
 * One instance is bound to a single (baseUrl, apiKey, apiSecret) tuple — i.e.
 * one company configuration. Auth is a static API key + secret pair sent on
 * every request, so there's no token lifecycle to manage (unlike Hostheaven).
 *
 * Implements the verbs the order-management UI + auto-provisioner need:
 *   - listPlans(category?)
 *   - listOs(category?)
 *   - listServices(query?)            (paginated)
 *   - getService(serviceId)
 *   - purchaseService({...})          (returns { serviceId, taskId })
 *   - checkServiceStock({...})        (read-only capacity check)
 *   - start(serviceId)
 *   - stop(serviceId)
 *   - reboot(serviceId)
 *   - rebuild(serviceId, { os })      (returns { taskId })
 *   - getRenewalPricing / renewService
 *   - Proxy apps: listProxies, getProxy, purchaseProxy, checkProxyStock,
 *     listProxyPlans, listProxyTemplates, proxyTaskStatus, updateProxyConfig,
 *     getProxyRenewalPricing, renewProxy
 *   - start / stop / reboot / rebuild
 *   - taskStatus / waitForTask
 *   - taskStatus(taskId)              (poll until COMPLETED | FAILED)
 *   - test()                          (cheap auth probe — list plans)
 *
 * All responses follow the standard envelope:
 *   { success: bool, message: string, data: any, timestamp: string }
 *
 * Errors thrown from this client preserve the upstream `status` and `body`
 * fields on the Error instance so callers can return useful HTTP responses
 * to the admin / customer.
 *
 * Upstream rate limits (10 min windows):
 *   Global 1000 | Read 600 (GET /plans, /os, /services…) | Action 100 (POST)
 *   Stock 120 (GET /services/stock only)
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const LIST_OS_CACHE_TTL_MS = 30 * 60 * 1000;
const { extractNetbayApiMessage } = require('@/lib/netbayApiErrors');

/** @type {Map<string, { expires: number, payload: unknown }>} */
const listOsCache = new Map();

/** Last seen RateLimit-* headers + stock backoff after 429. */
const rateLimitState = {
  limit: null,
  remaining: null,
  resetAt: null,
  stockLimitedUntil: 0,
};

function parseRateLimitHeaders(res) {
  const limit = res.headers.get('ratelimit-limit') ?? res.headers.get('RateLimit-Limit');
  const remaining = res.headers.get('ratelimit-remaining') ?? res.headers.get('RateLimit-Remaining');
  const reset = res.headers.get('ratelimit-reset') ?? res.headers.get('RateLimit-Reset');
  if (limit != null && limit !== '') rateLimitState.limit = Number(limit);
  if (remaining != null && remaining !== '') rateLimitState.remaining = Number(remaining);
  if (reset != null && reset !== '') rateLimitState.resetAt = Number(reset) * 1000;
}

function markStockRateLimited(resetEpochSec) {
  const resetMs = resetEpochSec ? Number(resetEpochSec) * 1000 : Date.now() + 10 * 60 * 1000;
  rateLimitState.stockLimitedUntil = Math.max(rateLimitState.stockLimitedUntil, resetMs);
}

function isStockCheckAllowed() {
  if (Date.now() < rateLimitState.stockLimitedUntil) return false;
  if (rateLimitState.remaining != null && rateLimitState.remaining <= 3) return false;
  return true;
}

function getRateLimitSnapshot() {
  return { ...rateLimitState };
}

function trimSlash(s) {
  return (s || '').replace(/\/+$/, '');
}

class NetbayApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'NetbayApiError';
    this.status = status;
    this.body = body;
  }
}

class NetbayApi {
  /**
   * @param {Object} cfg
   * @param {string} cfg.baseUrl        e.g. https://api.netbayhosts.in
   * @param {string} cfg.apiKey         X-API-Key  (ak_…)
   * @param {string} cfg.apiSecret      X-API-Secret (sk_…)
   * @param {string} [cfg.label]
   * @param {number} [cfg.timeoutMs=30000]
   */
  constructor(cfg = {}) {
    this.baseUrl = trimSlash(cfg.baseUrl || '');
    this.apiKey = (cfg.apiKey || '').trim();
    this.apiSecret = cfg.apiSecret || '';
    this.label = cfg.label || '';
    this.timeoutMs = Number(cfg.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (!this.baseUrl || !this.apiKey || !this.apiSecret) {
      throw new Error('NetbayApi: baseUrl, apiKey and apiSecret are all required');
    }
  }

  // ----------------------------- internals -----------------------------

  _headers({ json = true } = {}) {
    const headers = {
      Accept: 'application/json',
      'X-API-Key': this.apiKey,
      'X-API-Secret': this.apiSecret,
    };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async _request(path, { method = 'GET', body, query } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    let url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    if (query && typeof query === 'object') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
      }
      const s = qs.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }

    const init = {
      method,
      headers: this._headers({ json: !!body }),
      signal: ctrl.signal,
      cache: 'no-store',
    };
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    console.log('[NetbayApi/HTTP] →', { method, url, body });

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new NetbayApiError(`Netbay API timeout after ${this.timeoutMs}ms`, { status: 504 });
      }
      throw new NetbayApiError(`Netbay API fetch error: ${err.message}`, { status: 502 });
    }
    clearTimeout(timer);

    parseRateLimitHeaders(res);

    const text = await res.text();
    console.log('[NetbayApi/HTTP] ←', { status: res.status, bodyPreview: text?.slice(0, 600) });

    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }

    if (!res.ok || (parsed && typeof parsed === 'object' && parsed.success === false)) {
      const apiMsg = extractNetbayApiMessage(parsed) || (typeof parsed === 'string' ? parsed.slice(0, 200) : null);
      const msg = apiMsg || `HTTP ${res.status}`;
      if (res.status === 429 && String(path).includes('/services/stock')) {
        markStockRateLimited(rateLimitState.resetAt ? rateLimitState.resetAt / 1000 : null);
      }
      throw new NetbayApiError(msg, {
        status: res.status,
        body: parsed,
      });
    }

    return parsed;
  }

  // ----------------------------- public API -----------------------------

  /**
   * Cheap credentials probe — list plans (auth-required, low-cost endpoint).
   * Returns { ok: true, planCount } on success or { ok: false, message } on
   * failure. Never throws.
   */
  async test() {
    try {
      const res = await this._request('/api/v1/plans');
      const plans = res?.data?.plans || [];
      return {
        ok: true,
        planCount: Array.isArray(plans) ? plans.length : 0,
        message: `Connected — ${Array.isArray(plans) ? plans.length : 0} plan(s) visible.`,
      };
    } catch (err) {
      return { ok: false, message: err.message, status: err.status };
    }
  }

  /** Catalog: list all available service plans. */
  async listPlans({ category } = {}) {
    return this._request('/api/v1/plans', { query: { category } });
  }

  /** Catalog: list available OS templates (cached 30 min — Read quota). */
  async listOs({ category } = {}) {
    const cacheKey = `${this.apiKey}|${category || 'all'}`;
    const hit = listOsCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.payload;

    const res = await this._request('/api/v1/os', { query: { category } });
    listOsCache.set(cacheKey, { expires: Date.now() + LIST_OS_CACHE_TTL_MS, payload: res });
    return res;
  }

  /** Account: list services owned by the authenticated reseller. */
  async listServices({ page, limit, status } = {}) {
    return this._request('/api/v1/services', { query: { page, limit, status } });
  }

  /** Account: fetch a single service. */
  async getService(serviceId) {
    if (!serviceId) throw new Error('NetbayApi.getService: serviceId is required');
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}`);
  }

  /**
   * Provision a new VM. Returns the upstream payload which contains:
   *   data.serviceId  (the service id to use for power actions)
   *   data.taskId     (poll via taskStatus until COMPLETED)
   *   data.status     (PENDING)
   *
   * Required: planId, os  (os = template *name* from GET /api/v1/os — not osId)
   * Optional: months (1-36, default 1), groupTag, couponCode, callbackUrl
   */
  async purchaseService({ planId, os, months, groupTag, couponCode, callbackUrl }) {
    if (!planId) throw new Error('NetbayApi.purchaseService: planId is required');
    if (!os) throw new Error('NetbayApi.purchaseService: os is required');
    const body = { planId, os };
    if (months) body.months = Number(months);
    if (groupTag) body.groupTag = String(groupTag);
    const coupon = String(couponCode || '').trim().toUpperCase();
    if (coupon) body.couponCode = coupon;
    if (callbackUrl) body.callbackUrl = String(callbackUrl);
    return this._request('/api/v1/services/purchase', { method: 'POST', body });
  }

  /**
   * Read-only VM stock check for a plan + OS (+ optional location).
   * GET /api/v1/services/stock — does not touch wallet balance.
   */
  async checkServiceStock({ planId, os, groupTag }) {
    if (!planId) throw new Error('NetbayApi.checkServiceStock: planId is required');
    if (!os) throw new Error('NetbayApi.checkServiceStock: os is required');
    const query = { planId, os: String(os) };
    if (groupTag) query.groupTag = String(groupTag);
    return this._request('/api/v1/services/stock', { query });
  }

  /**
   * Convenience wrapper — returns { available, reason, details } without throwing
   * on upstream "no capacity" (503) responses.
   */
  async isServiceStockAvailable({ planId, os, groupTag }) {
    if (!isStockCheckAllowed()) {
      return {
        available: null,
        skipped: true,
        rateLimited: true,
        reason: 'Stock API rate limit — using cached availability',
        details: null,
        message: 'Stock check deferred (rate limit)',
      };
    }

    try {
      const res = await this.checkServiceStock({ planId, os, groupTag });
      const data = res?.data || {};
      return {
        available: data.available === true,
        reason: data.reason || null,
        details: data.details || null,
        message: res?.message || null,
      };
    } catch (err) {
      if (err.status === 503) {
        const body = err.body?.data || err.body || {};
        return {
          available: false,
          skipped: false,
          reason: body.reason || err.body?.message || 'No capacity or IP available',
          details: body.details || null,
          message: err.body?.message || err.message,
        };
      }
      if (err.status === 429) {
        markStockRateLimited(rateLimitState.resetAt ? rateLimitState.resetAt / 1000 : null);
        return {
          available: null,
          skipped: true,
          rateLimited: true,
          reason: err.message || 'Rate limit exceeded',
          details: null,
          message: err.message,
        };
      }
      // Netbay stock route sometimes 500s (e.g. /services/stock parsed as :id) — don't block sales
      if (err.status >= 500) {
        return {
          available: null,
          skipped: true,
          reason: err.message,
          details: null,
          message: err.message,
        };
      }
      throw err;
    }
  }

  /** GET renewal unit price for a service (ignores wallet balance). */
  async getRenewalPricing(serviceId) {
    if (!serviceId) throw new Error('NetbayApi.getRenewalPricing: serviceId is required');
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}/renewal-pricing`);
  }

  /** POST renew — extends service for `months` (min 1), deducts Netbay wallet. */
  async renewService(serviceId, { months = 1, couponCode } = {}) {
    if (!serviceId) throw new Error('NetbayApi.renewService: serviceId is required');
    const m = Math.max(1, Math.floor(Number(months) || 1));
    const body = { months: m };
    const coupon = String(couponCode || '').trim().toUpperCase();
    if (coupon) body.couponCode = coupon;
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}/renew`, {
      method: 'POST',
      body,
    });
  }

  /** Power: start a stopped service. */
  async start(serviceId) {
    if (!serviceId) throw new Error('NetbayApi.start: serviceId is required');
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}/start`, { method: 'POST' });
  }

  /** Power: stop a running service gracefully. */
  async stop(serviceId) {
    if (!serviceId) throw new Error('NetbayApi.stop: serviceId is required');
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}/stop`, { method: 'POST' });
  }

  /** Power: reboot a running service. */
  async reboot(serviceId) {
    if (!serviceId) throw new Error('NetbayApi.reboot: serviceId is required');
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}/reboot`, { method: 'POST' });
  }

  /**
   * Rebuild a service with a fresh OS install. Async — returns a taskId.
   * Rate-limited by upstream to 3 rebuilds / 24h.
   */
  async rebuild(serviceId, { os, callbackUrl } = {}) {
    if (!serviceId) throw new Error('NetbayApi.rebuild: serviceId is required');
    const body = {};
    if (os) body.os = String(os);
    if (callbackUrl) body.callbackUrl = String(callbackUrl);
    return this._request(`/api/v1/services/${encodeURIComponent(serviceId)}/rebuild`, {
      method: 'POST',
      body,
    });
  }

  /**
   * Poll the status of an asynchronous task (purchase, rebuild). Status
   * values: PENDING | PROCESSING | COMPLETED | FAILED.
   */
  async taskStatus(taskId) {
    if (!taskId) throw new Error('NetbayApi.taskStatus: taskId is required');
    return this._request(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  /**
   * Convenience: poll a task until it terminates (COMPLETED / FAILED) or the
   * timeout elapses. Returns the final task object. Useful in the auto
   * provisioner — the `purchase` task usually finishes within ~60s.
   *
   * @param {string} taskId
   * @param {Object} opts
   * @param {number} [opts.maxWaitMs=180000]   give up after this long
   * @param {number} [opts.pollIntervalMs=4000]
   */
  async waitForTask(taskId, { maxWaitMs = 180_000, pollIntervalMs = 4_000, proxy = false } = {}) {
    const deadline = Date.now() + maxWaitMs;
    let lastStatus = 'PENDING';
    let lastTask = null;
    while (Date.now() < deadline) {
      try {
        const res = proxy ? await this.proxyTaskStatus(taskId) : await this.taskStatus(taskId);
        const task = res?.data || res;
        lastTask = task;
        lastStatus = task?.status || lastStatus;
        if (lastStatus === 'COMPLETED' || lastStatus === 'FAILED') return task;
      } catch (err) {
        if (err.status && err.status >= 400 && err.status < 500) throw err;
        console.warn(`[NetbayApi] waitForTask poll error (continuing): ${err.message}`);
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    return lastTask || { status: lastStatus, taskId, _timedOut: true };
  }

  // ----------------------------- HTTP proxies -----------------------------

  async listProxies() {
    return this._request('/api/v1/proxies');
  }

  async getProxy(proxyId) {
    if (!proxyId) throw new Error('NetbayApi.getProxy: proxyId is required');
    return this._request(`/api/v1/proxies/${encodeURIComponent(proxyId)}`);
  }

  /**
   * POST /api/v1/proxies/purchase — Applications/proxy plans only.
   */
  async purchaseProxy({
    planId,
    os = 'PROXY',
    months,
    groupTag,
    couponCode,
    callbackUrl,
    proxyUser,
    proxyPass,
    proxyPort,
  }) {
    if (!planId) throw new Error('NetbayApi.purchaseProxy: planId is required');
    if (!os) throw new Error('NetbayApi.purchaseProxy: os is required');
    const body = { planId, os: String(os) };
    if (months) body.months = Number(months);
    if (groupTag) body.groupTag = String(groupTag);
    const coupon = String(couponCode || '').trim().toUpperCase();
    if (coupon) body.couponCode = coupon;
    if (callbackUrl) body.callbackUrl = String(callbackUrl);
    if (proxyUser) body.proxyUser = String(proxyUser);
    if (proxyPass) body.proxyPass = String(proxyPass);
    if (proxyPort != null && proxyPort !== '') body.proxyPort = Number(proxyPort);
    return this._request('/api/v1/proxies/purchase', { method: 'POST', body });
  }

  async checkProxyStock({ planId, os, groupTag }) {
    if (!planId) throw new Error('NetbayApi.checkProxyStock: planId is required');
    if (!os) throw new Error('NetbayApi.checkProxyStock: os is required');
    const query = { planId, os: String(os) };
    if (groupTag) query.groupTag = String(groupTag);
    return this._request('/api/v1/proxies/stock', { query });
  }

  async isProxyStockAvailable({ planId, os, groupTag }) {
    if (!isStockCheckAllowed()) {
      return {
        available: null,
        skipped: true,
        rateLimited: true,
        reason: 'Stock API rate limit — using cached availability',
        details: null,
        message: 'Stock check deferred (rate limit)',
      };
    }
    try {
      const res = await this.checkProxyStock({ planId, os, groupTag });
      const data = res?.data || {};
      return {
        available: data.available === true,
        reason: data.reason || null,
        details: data.details || null,
        message: res?.message || null,
      };
    } catch (err) {
      if (err.status === 503) {
        const body = err.body?.data || err.body || {};
        return {
          available: false,
          skipped: false,
          reason: body.reason || err.body?.message || 'No proxy capacity available',
          details: body.details || null,
          message: err.body?.message || err.message,
        };
      }
      if (err.status === 429) {
        markStockRateLimited(rateLimitState.resetAt ? rateLimitState.resetAt / 1000 : null);
        return {
          available: null,
          skipped: true,
          rateLimited: true,
          reason: err.message || 'Rate limit exceeded',
          details: null,
          message: err.message,
        };
      }
      if (err.status >= 500) {
        return {
          available: null,
          skipped: true,
          reason: err.message,
          details: null,
          message: err.message,
        };
      }
      throw err;
    }
  }

  async listProxyPlans() {
    return this._request('/api/v1/proxies/plans');
  }

  async listProxyTemplates() {
    return this._request('/api/v1/proxies/templates');
  }

  async proxyTaskStatus(taskId) {
    if (!taskId) throw new Error('NetbayApi.proxyTaskStatus: taskId is required');
    return this._request(`/api/v1/proxies/tasks/${encodeURIComponent(taskId)}`);
  }

  async updateProxyConfig(proxyId, { proxyUser, proxyPass, proxyPort } = {}) {
    if (!proxyId) throw new Error('NetbayApi.updateProxyConfig: proxyId is required');
    const body = {};
    if (proxyUser) body.proxyUser = String(proxyUser);
    if (proxyPass) body.proxyPass = String(proxyPass);
    if (proxyPort != null && proxyPort !== '') body.proxyPort = Number(proxyPort);
    return this._request(`/api/v1/proxies/${encodeURIComponent(proxyId)}/config`, {
      method: 'POST',
      body,
    });
  }

  async getProxyRenewalPricing(proxyId) {
    if (!proxyId) throw new Error('NetbayApi.getProxyRenewalPricing: proxyId is required');
    return this._request(`/api/v1/proxies/${encodeURIComponent(proxyId)}/renewal-pricing`);
  }

  async renewProxy(proxyId, { months = 1, couponCode } = {}) {
    if (!proxyId) throw new Error('NetbayApi.renewProxy: proxyId is required');
    const m = Math.max(1, Math.floor(Number(months) || 1));
    const body = { months: m };
    const coupon = String(couponCode || '').trim().toUpperCase();
    if (coupon) body.couponCode = coupon;
    return this._request(`/api/v1/proxies/${encodeURIComponent(proxyId)}/renew`, {
      method: 'POST',
      body,
    });
  }

  static unwrapProxyResponse(res) {
    if (!res || typeof res !== 'object') return null;
    return res.data?.proxy || res.proxy || res.data || res;
  }

  static extractProxyId(data) {
    if (!data || typeof data !== 'object') return '';
    return String(data.proxyId || data.id || data._id || '').trim();
  }

  static extractProxyCredentials(src) {
    if (!src || typeof src !== 'object') return null;
    const creds = src.credentials && typeof src.credentials === 'object' ? src.credentials : src;
    const host = String(creds.host || creds.ip || creds.ipAddress || '').split(':')[0].trim();
    const port = Number(creds.port || creds.proxyPort || 0) || null;
    const user = String(creds.user || creds.username || creds.proxyUser || '').trim();
    const pass = String(creds.pass || creds.password || creds.proxyPass || '').trim();
    if (!host && !user) return null;
    const formatted =
      creds.formattedCreds ||
      (host && port && user && pass ? `${host}:${port}:${user}:${pass}` : '');
    const httpUrl =
      creds.httpUrl ||
      (host && port && user && pass ? `http://${user}:${pass}@${host}:${port}` : '');
    return { host, port, user, pass, formattedCreds: formatted, httpUrl };
  }

  // ----------------------------- helpers -----------------------------

  /**
   * Resolve a Netbay OS template *name* from the upstream catalog.
   * Purchase/rebuild endpoints require the exact template name — not our
   * internal order enum values like "Ubuntu 22".
   */
  static resolveOsTemplateName(osList, { preferred, isWindows } = {}) {
    const list = Array.isArray(osList) ? osList : [];
    if (list.length === 0) return '';

    const normalize = (s) => String(s || '').trim().toLowerCase();
    const getName = (o) => String(o?.name || o?.title || '').trim();
    const getId = (o) => String(o?.id || o?._id || o?.osId || '').trim();

    const isWindowsEntry = (o) => {
      const cat = normalize(o?.category);
      const name = normalize(getName(o));
      return cat.includes('win') || name.includes('windows');
    };

    const byPlatform = list.filter(o => (isWindows ? isWindowsEntry(o) : !isWindowsEntry(o)));
    const pool = byPlatform.length ? byPlatform : list;

    const hints = [];
    if (Array.isArray(preferred)) hints.push(...preferred);
    else if (preferred) hints.push(preferred);
    if (isWindows) hints.push('Windows Server 2022', 'Windows 2022', 'Windows 2022 64');
    else hints.push('Ubuntu 22', 'Ubuntu 22.04', 'ubuntu');

    // Catalog OS ID (admin can paste id from /netbay-catalog instead of name)
    for (const hint of hints) {
      const h = String(hint || '').trim();
      if (!h) continue;
      const byId = pool.find(o => getId(o) === h);
      if (byId) return getName(byId);
    }

    for (const hint of hints) {
      const h = normalize(hint);
      if (!h) continue;
      const exact = pool.find(o => normalize(getName(o)) === h);
      if (exact) return getName(exact);
    }

    for (const hint of hints) {
      const h = normalize(hint);
      if (!h) continue;
      const partial = pool.find(o => {
        const n = normalize(getName(o));
        return n.includes(h) || h.includes(n);
      });
      if (partial) return getName(partial);
    }

    if (!isWindows) {
      const ubuntu = pool.find(o => normalize(getName(o)).includes('ubuntu'));
      if (ubuntu) return getName(ubuntu);
    } else {
      const win = pool.find(o => normalize(getName(o)).includes('windows'));
      if (win) return getName(win);
    }

    return getName(pool[0]) || '';
  }

  /**
   * Netbay GET /services/:id returns { data: { service: { ... } } } — unwrap
   * to the inner service object for IP/credentials/power state.
   */
  static unwrapServiceResponse(res) {
    const data = res?.data ?? res ?? {};
    if (data?.service && typeof data.service === 'object') return data.service;
    return data;
  }

  /**
   * Best-effort: pick a service id out of an upstream payload. Netbay returns
   * `serviceId` consistently, but we also accept `id` / `_id` for safety.
   */
  static extractServiceId(svc) {
    if (!svc || typeof svc !== 'object') return '';
    return String(
      svc.serviceId ||
      svc.service_id ||
      svc.id ||
      svc._id ||
      ''
    ).trim();
  }

  /**
   * Best-effort: pick the IP address out of a Netbay service object. The
   * exact shape isn't fully documented but consistent with most providers
   * (`ip`, `ipAddress`, `mainIp`, or first entry in `ips[]`).
   */
  static extractServiceIp(svc) {
    if (!svc || typeof svc !== 'object') return '';
    const candidates = [
      svc.ip,
      svc.ipAddress,
      svc.primaryIp,
      svc.mainIp,
      Array.isArray(svc.ips) && svc.ips.length > 0 ? svc.ips[0] : null,
    ].filter(Boolean);
    if (candidates.length === 0) return '';
    return String(candidates[0]).split(':')[0].trim();
  }

  /** Whether a GET /services/stock call is safe right now (120 / 10 min bucket). */
  static isStockCheckAllowed() {
    return isStockCheckAllowed();
  }

  static getRateLimitSnapshot() {
    return getRateLimitSnapshot();
  }
}

module.exports = NetbayApi;
module.exports.NetbayApi = NetbayApi;
module.exports.NetbayApiError = NetbayApiError;
module.exports.getNetbayRateLimitSnapshot = getRateLimitSnapshot;
