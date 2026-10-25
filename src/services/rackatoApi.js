/**
 * Rackato reseller API (https://www.rackato.com/api/v1/reseller).
 * Auth: X-Reseller-Key-Id + X-Reseller-Key-Secret.
 * Sandbox keys validate orders without debiting the Rackato wallet.
 */

const DEFAULT_BASE_URL = 'https://www.rackato.com';
const DEFAULT_TIMEOUT_MS = 45_000;

class RackatoApiError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message);
    this.name = 'RackatoApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

class RackatoApi {
  constructor(cfg = {}) {
    this.baseUrl = trimSlash(cfg.baseUrl || DEFAULT_BASE_URL);
    this.keyId = String(cfg.keyId || '').trim();
    this.keySecret = String(cfg.keySecret || '').trim();
    this.timeoutMs = Number(cfg.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!this.keyId || !this.keySecret) {
      throw new RackatoApiError('Rackato key id and secret are required', { code: 'NO_CREDENTIALS' });
    }
  }

  async request(method, path, { query, body, timeoutMs } = {}) {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
      }
    }

    const run = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Accept: 'application/json',
            'X-Reseller-Key-Id': this.keyId,
            'X-Reseller-Key-Secret': this.keySecret,
            ...(body != null ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body != null ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }
        return { res, data };
      } finally {
        clearTimeout(timer);
      }
    };

    let { res, data } = await run();
    if (res.status === 429) {
      const waitSec = Math.min(10, Math.max(1, Number(res.headers.get('retry-after')) || 2));
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
      ({ res, data } = await run());
    }

    if (!res.ok || data?.success === false) {
      const message = data?.message || data?.error || `Rackato HTTP ${res.status}`;
      throw new RackatoApiError(message, { status: res.status, body: data, code: 'HTTP_ERROR' });
    }
    return data;
  }

  listProducts(query = {}) {
    return this.request('GET', '/api/v1/reseller/products', { query });
  }

  getProduct(productId) {
    return this.request('GET', `/api/v1/reseller/products/${encodeURIComponent(productId)}`);
  }

  createOrder(payload) {
    return this.request('POST', '/api/v1/reseller/orders', { body: payload, timeoutMs: 90_000 });
  }

  listOrders(query = {}) {
    return this.request('GET', '/api/v1/reseller/orders', { query });
  }

  getOrder(orderId) {
    return this.request('GET', `/api/v1/reseller/orders/${encodeURIComponent(orderId)}`);
  }

  listNodes(query = {}) {
    return this.request('GET', '/api/v1/reseller/nodes', { query });
  }

  getNode(uid) {
    return this.request('GET', `/api/v1/reseller/nodes/${encodeURIComponent(uid)}`);
  }

  nodeAction(uid, action, body) {
    return this.request('POST', `/api/v1/reseller/nodes/${encodeURIComponent(uid)}/${action}`, {
      body: body || undefined,
      timeoutMs: 90_000,
    });
  }

  getWallet() {
    return this.request('GET', '/api/v1/reseller/wallet/balance');
  }
}

module.exports = RackatoApi;
module.exports.RackatoApiError = RackatoApiError;
module.exports.DEFAULT_BASE_URL = DEFAULT_BASE_URL;
