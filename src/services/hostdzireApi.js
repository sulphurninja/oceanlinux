/**
 * HostDzire WHMCS VPS API client.
 * POST https://hostdzire.com/api/vps/  (application/x-www-form-urlencoded)
 * Every request: api_key + action (+ ip / inventory_key / os as needed).
 */

const DEFAULT_BASE_URL = 'https://hostdzire.com/api/vps/';
const DEFAULT_TIMEOUT_MS = 45_000;

const VPS_ACTIONS = Object.freeze([
  'reboot',
  'stop',
  'start',
  'suspend',
  'unsuspend',
  'details',
  'bandwidth',
  'install',
  'reinstall',
  'orders',
  'pay_invoice_by_ip',
  'place_order',
  'available_cloud_vps_data',
]);

class HostdzireApiError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message);
    this.name = 'HostdzireApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

class HostdzireApi {
  /**
   * @param {Object} cfg
   * @param {string} cfg.apiKey 64-char HostDzire API key
   * @param {string} [cfg.baseUrl] defaults to https://hostdzire.com/api/vps/
   * @param {string} [cfg.label]
   */
  constructor(cfg = {}) {
    let baseUrl = String(cfg.baseUrl || DEFAULT_BASE_URL).trim();
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    this.baseUrl = baseUrl;
    this.apiKey = String(cfg.apiKey || '').trim();
    this.label = cfg.label || '';
    this.timeoutMs = Number(cfg.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (!this.apiKey) {
      throw new HostdzireApiError('HostDzire API key is required', { code: 'NO_CREDENTIALS' });
    }
  }

  async _post(fields = {}) {
    const body = new URLSearchParams();
    body.set('api_key', this.apiKey);
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== '') body.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (data?.status === 'error') {
        throw new HostdzireApiError(data.message || 'HostDzire API error', {
          status: res.status,
          body: data,
          code: 'API_ERROR',
        });
      }

      if (!res.ok) {
        throw new HostdzireApiError(data?.message || `HTTP ${res.status}`, {
          status: res.status,
          body: data,
          code: 'HTTP_ERROR',
        });
      }

      return data;
    } catch (err) {
      if (err instanceof HostdzireApiError) throw err;
      if (err.name === 'AbortError') {
        throw new HostdzireApiError('Request timed out', { status: 504, code: 'TIMEOUT' });
      }
      throw new HostdzireApiError(err.message || 'Network error', { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Auth probe — lists active WHMCS services. */
  async test() {
    const data = await this._post({ action: 'orders' });
    const count = Array.isArray(data?.orders) ? data.orders.length : 0;
    return { ok: true, orderCount: count, status: data?.status || 'success' };
  }

  getDetails(ip) {
    return this._post({ action: 'details', ip });
  }

  getBandwidth(ip) {
    return this._post({ action: 'bandwidth', ip });
  }

  start(ip) {
    return this._post({ action: 'start', ip });
  }

  stop(ip) {
    return this._post({ action: 'stop', ip });
  }

  reboot(ip) {
    return this._post({ action: 'reboot', ip });
  }

  suspend(ip) {
    return this._post({ action: 'suspend', ip });
  }

  unsuspend(ip) {
    return this._post({ action: 'unsuspend', ip });
  }

  reinstall(ip, os) {
    const fields = { action: 'reinstall', ip };
    if (os) fields.os = os;
    return this._post(fields);
  }

  install(ip, os) {
    return this._post({ action: 'install', ip, os });
  }

  getAvailableCloudVpsData() {
    return this._post({ action: 'available_cloud_vps_data' });
  }

  getOrders() {
    return this._post({ action: 'orders' });
  }

  placeOrder({ inventoryKey, os, quantity = 1, coupon } = {}) {
    const fields = {
      action: 'place_order',
      inventory_key: inventoryKey,
      quantity,
      os,
    };
    if (coupon) fields.coupon = coupon;
    return this._post(fields);
  }

  payInvoiceByIp(ip) {
    return this._post({ action: 'pay_invoice_by_ip', ip });
  }

  /** Map details response to OceanLinux powerState. */
  static resolvePowerState(detailsPayload) {
    const data = detailsPayload?.data || detailsPayload?.result || detailsPayload;
    const status = String(data?.status || '').toLowerCase();
    if (status === 'active' || status === 'running' || status === 'online') return 'running';
    if (status === 'suspended' || status === 'stopped' || status === 'offline') return 'stopped';
    if (['processing', 'pending', 'starting', 'stopping', 'rebooting', 'reinstalling', 'installing'].includes(status)) {
      return 'busy';
    }
    return 'unknown';
  }

  /** Extract ipv4 from details for validation. */
  static extractIpv4(detailsPayload) {
    const data = detailsPayload?.data || detailsPayload?.result || detailsPayload;
    return String(data?.ipv4 || data?.ip || '').trim();
  }

  /** Extract login fields from details response. */
  static extractCredentials(detailsPayload) {
    const data = detailsPayload?.data || detailsPayload?.result || detailsPayload;
    const os = String(data?.os || '').trim();
    const isWindows = /windows/i.test(os);
    return {
      username: data?.username || (isWindows ? 'Administrator' : 'root'),
      password: String(data?.password || '').trim(),
      hostname: String(data?.hostname || '').trim(),
      os,
    };
  }
}

HostdzireApi.VPS_ACTIONS = VPS_ACTIONS;
HostdzireApi.DEFAULT_BASE_URL = DEFAULT_BASE_URL;
HostdzireApi.HostdzireApiError = HostdzireApiError;

module.exports = HostdzireApi;
