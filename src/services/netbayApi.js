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
 *   - start(serviceId)
 *   - stop(serviceId)
 *   - reboot(serviceId)
 *   - rebuild(serviceId, { os })      (returns { taskId })
 *   - taskStatus(taskId)              (poll until COMPLETED | FAILED)
 *   - test()                          (cheap auth probe — list plans)
 *
 * All responses follow the standard envelope:
 *   { success: bool, message: string, data: any, timestamp: string }
 *
 * Errors thrown from this client preserve the upstream `status` and `body`
 * fields on the Error instance so callers can return useful HTTP responses
 * to the admin / customer.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

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

    const text = await res.text();
    console.log('[NetbayApi/HTTP] ←', { status: res.status, bodyPreview: text?.slice(0, 600) });

    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }

    if (!res.ok || (parsed && typeof parsed === 'object' && parsed.success === false)) {
      const msg = (parsed && typeof parsed === 'object' && (parsed.message || parsed.error))
        || (typeof parsed === 'string' ? parsed.slice(0, 200) : `HTTP ${res.status}`);
      throw new NetbayApiError(`Netbay ${method} ${path}: ${msg}`, {
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

  /** Catalog: list available OS templates. */
  async listOs({ category } = {}) {
    return this._request('/api/v1/os', { query: { category } });
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
   * Required: planId, os
   * Optional: months (1-36, default 1), groupTag, callbackUrl
   */
  async purchaseService({ planId, os, months, groupTag, callbackUrl }) {
    if (!planId) throw new Error('NetbayApi.purchaseService: planId is required');
    if (!os) throw new Error('NetbayApi.purchaseService: os is required');
    const body = { planId, os };
    if (months) body.months = Number(months);
    if (groupTag) body.groupTag = String(groupTag);
    if (callbackUrl) body.callbackUrl = String(callbackUrl);
    return this._request('/api/v1/services/purchase', { method: 'POST', body });
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
  async waitForTask(taskId, { maxWaitMs = 180_000, pollIntervalMs = 4_000 } = {}) {
    const deadline = Date.now() + maxWaitMs;
    let lastStatus = 'PENDING';
    let lastTask = null;
    while (Date.now() < deadline) {
      try {
        const res = await this.taskStatus(taskId);
        const task = res?.data || res;
        lastTask = task;
        lastStatus = task?.status || lastStatus;
        if (lastStatus === 'COMPLETED' || lastStatus === 'FAILED') return task;
      } catch (err) {
        // Transient errors are tolerated unless they're 4xx (client problems
        // that won't self-heal). Treat 4xx as terminal.
        if (err.status && err.status >= 400 && err.status < 500) throw err;
        console.warn(`[NetbayApi] waitForTask poll error (continuing): ${err.message}`);
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    return lastTask || { status: lastStatus, taskId, _timedOut: true };
  }

  // ----------------------------- helpers -----------------------------

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
}

module.exports = NetbayApi;
module.exports.NetbayApi = NetbayApi;
module.exports.NetbayApiError = NetbayApiError;
