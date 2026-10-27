/**
 * Nexa Dedicated IP API (https://nexahostvps.com/api/v1/dedicated-ips).
 * Auth header: X-API-Key.
 * GET  ?action=plans | orders
 * POST { action: "order" | "control", ... }
 */

const DEFAULT_BASE_URL = 'https://nexahostvps.com/api/v1/dedicated-ips';
const DEFAULT_TIMEOUT_MS = 45_000;

class NexaApiError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message);
    this.name = 'NexaApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

class NexaApi {
  constructor(cfg = {}) {
    this.baseUrl = String(cfg.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    this.apiKey = String(cfg.apiKey || '').trim();
    this.label = cfg.label || '';
    this.timeoutMs = Number(cfg.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!this.apiKey) {
      throw new NexaApiError('Nexa API key is required', { code: 'NO_CREDENTIALS' });
    }
  }

  async _request(method, { query, body } = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('api_key', this.apiKey);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'X-API-Key': this.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text.slice(0, 300) };
      }
      if (data && data.success === false) {
        throw new NexaApiError(data.message || data.error || 'Nexa API rejected the request', {
          status: res.status || 502,
          body: data,
          code: 'API_ERROR',
        });
      }
      if (!res.ok) {
        throw new NexaApiError(data?.message || data?.error || `HTTP ${res.status}`, {
          status: res.status,
          body: data,
          code: 'HTTP_ERROR',
        });
      }
      return data;
    } catch (err) {
      if (err instanceof NexaApiError) throw err;
      if (err.name === 'AbortError') {
        throw new NexaApiError('Request timed out', { status: 504, code: 'TIMEOUT' });
      }
      throw new NexaApiError(err.message || 'Network error', { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }
  }

  getPlans() {
    return this._request('GET', { query: { action: 'plans' } });
  }

  getBalance() {
    return this._request('GET', { query: { action: 'balance' } });
  }

  listOrders() {
    return this._request('GET', { query: { action: 'orders' } });
  }

  async test() {
    const plans = await this.getPlans();
    const balance = await this.getBalance();
    const account = balance?.account || {};
    return {
      ok: true,
      planCount: Number(plans?.total_plans || (plans?.plans || []).length || 0),
      orderCount: Number(account.total_orders ?? account.active_ips_count ?? 0),
      walletBalance: account.wallet_balance ?? null,
      currency: account.currency_symbol || account.currency || '₹',
    };
  }

  static normalizeOrderProtocol(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'SOCKS5' || raw === 'SOCKS') return 'SOCKS5';
    if (raw === 'HTTP' || raw === 'HTTPS') return 'HTTP';
    if (raw.includes('SOCKS')) return 'SOCKS5';
    if (raw.includes('HTTP')) return 'HTTP';
    return 'SOCKS5';
  }

  purchase({ planId, poolId, quantity = 1, protocol = 'SOCKS5' }) {
    return this._request('POST', {
      query: { action: 'order' },
      body: {
        action: 'order',
        plan_id: Number(planId),
        pool_id: Number(poolId || 0),
        quantity: Number(quantity || 1),
        protocol: NexaApi.normalizeOrderProtocol(protocol),
      },
    });
  }

  control(orderId, command, extra = {}) {
    const body = {
      action: 'control',
      command: String(command),
      order_id: Number(orderId),
    };
    if (extra.username) body.username = String(extra.username);
    if (extra.password) body.password = String(extra.password);
    if (extra.port != null && extra.port !== '') body.port = Number(extra.port);
    return this._request('POST', { query: { action: 'control' }, body });
  }

  static absorbProxyValue(state, value, { overwrite = false } = {}) {
    if (value == null || typeof value === 'object') return;
    const raw = String(value).trim();
    if (!raw) return;
    const full = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+):([^:]+):([\s\S]+)$/);
    if (full) {
      if (overwrite || !state.ip) state.ip = full[1];
      if (overwrite || !state.port) state.port = full[2];
      if (overwrite || !state.username) state.username = full[3];
      if (overwrite || !state.password) state.password = full[4];
      return;
    }
    const hostPort = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
    if (hostPort) {
      if (!state.ip) state.ip = hostPort[1];
      if (!state.port) state.port = hostPort[2];
    }
  }

  static extractOrderIp(row) {
    if (!row || typeof row !== 'object') return '';
    const raw = row.ip || row.ip_address || row.dedicated_ip || row.proxy_ip || row.address || '';
    return String(raw).split(':')[0].trim();
  }

  static extractPurchaseDelivery(payload) {
    const rows = [];
    const push = (obj) => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) rows.push(obj);
    };
    push(payload);
    push(payload?.order);
    push(payload?.data);
    push(payload?.data?.order);
    push(payload?.result);
    const list = payload?.orders || payload?.data?.orders;
    if (Array.isArray(list)) push(list[0]);

    const state = { ip: '', username: '', password: '', port: '' };
    let orderId = '';
    let expiry = null;
    for (const row of rows) {
      for (const key of ['ip', 'ip_address', 'dedicated_ip', 'proxy_ip', 'address', 'proxy', 'credentials', 'proxy_string', 'connection_string']) {
        NexaApi.absorbProxyValue(state, row[key]);
      }
      if (!state.ip) state.ip = NexaApi.extractOrderIp(row);
      if (!orderId) orderId = NexaApi.extractOrderId(row);
      const user = String(row.username || row.user || row.proxy_user || row.login || '').trim();
      const pass = String(row.password || row.pass || row.proxy_pass || row.proxy_password || '').trim();
      if (user) state.username = user;
      if (pass) state.password = pass;
      if (!state.port) {
        const rawPort = row.port ?? row.proxy_port ?? row.socks_port;
        if (rawPort != null && rawPort !== '') state.port = String(rawPort).trim();
      }
      if (Array.isArray(row.nodes)) {
        for (const node of row.nodes) {
          if (!node || typeof node !== 'object') continue;
          const nodeUser = String(node.username || node.user || node.proxy_user || '').trim();
          const nodePass = String(node.password || node.pass || node.proxy_pass || '').trim();
          if (nodeUser) state.username = nodeUser;
          if (nodePass) state.password = nodePass;
          if (node.port != null && node.port !== '') state.port = String(node.port).trim();
          NexaApi.absorbProxyValue(state, node.combo, { overwrite: true });
        }
      }
      NexaApi.absorbProxyValue(state, row.combo, { overwrite: true });
      if (!expiry) expiry = row.expires_at || row.expiry || row.expiry_date || row.expiresAt || null;
      const nested = row.credentials || row.proxy || row.ip_details;
      if (typeof nested === 'string') {
        NexaApi.absorbProxyValue(state, nested);
      } else if (nested && typeof nested === 'object') {
        for (const key of ['ip', 'ip_address', 'dedicated_ip', 'proxy_ip', 'address', 'proxy']) {
          NexaApi.absorbProxyValue(state, nested[key]);
        }
        if (!state.ip) state.ip = NexaApi.extractOrderIp(nested);
        if (!state.username) state.username = String(nested.username || nested.user || nested.proxy_user || '').trim();
        if (!state.password) state.password = String(nested.password || nested.pass || nested.proxy_pass || '').trim();
        if (!state.port) {
          const rawPort = nested.port ?? nested.proxy_port;
          if (rawPort != null && rawPort !== '') state.port = String(rawPort).trim();
        }
      }
    }
    return { ip: state.ip, username: state.username, password: state.password, port: state.port, orderId, expiry };
  }

  /** Fields to write on our order when Nexa rotated the proxy login. */
  static deliveryUpdates(order, delivered) {
    const updates = {};
    const changes = [];
    if (!delivered) return { updates, changes };
    if (delivered.username && delivered.username !== String(order?.username || '')) {
      updates.username = delivered.username;
      changes.push('username');
    }
    if (delivered.password && delivered.password !== String(order?.password || '')) {
      updates.password = delivered.password;
      changes.push('password');
    }
    const host = String(delivered.ip || order?.ipAddress || '').split(':')[0].trim();
    if (host && delivered.port) {
      const nextIp = `${host}:${delivered.port}`;
      if (nextIp !== String(order?.ipAddress || '')) {
        updates.ipAddress = nextIp;
        changes.push('ipAddress');
      }
    }
    return { updates, changes };
  }

  static extractOrderId(row) {
    if (!row || typeof row !== 'object') return '';
    const id = row.order_id ?? row.id ?? row.orderId;
    return id == null ? '' : String(id);
  }

  async findOrderByIp(ip) {
    const wanted = String(ip || '').split(':')[0].trim();
    if (!wanted) return null;
    const data = await this.listOrders();
    const rows = Array.isArray(data?.orders) ? data.orders : [];
    return rows.find((row) => NexaApi.extractOrderIp(row) === wanted) || null;
  }

  static normalizePowerState(payload) {
    const layers = [payload?.order, payload?.data?.order, payload?.data, payload].filter(
      (row) => row && typeof row === 'object'
    );
    const rank = (value) => {
      const raw = String(value || '').toLowerCase().trim();
      if (['running', 'online', 'on', 'started', 'up'].includes(raw)) return 'running';
      if (['stopped', 'offline', 'off', 'shutdown', 'down'].includes(raw)) return 'stopped';
      if (['processing', 'pending', 'starting', 'stopping', 'rebooting', 'reinstalling', 'busy'].includes(raw)) {
        return 'busy';
      }
      return '';
    };
    for (const layer of layers) {
      const live = rank(layer.live_power_state || layer.live_status || layer.power_state || layer.power);
      if (live) return live;
    }
    return 'unknown';
  }
}

module.exports = NexaApi;
module.exports.NexaApi = NexaApi;
module.exports.NexaApiError = NexaApiError;
module.exports.DEFAULT_BASE_URL = DEFAULT_BASE_URL;
