const BASE_URL = 'https://api.advps.org';

/** ADVPS production tier is 100 req / 15 min — reuse OS catalog across provisions & crons. */
const LIST_OS_CACHE_TTL_MS = 14 * 60 * 1000;
const listOsCache = new Map();

function getApiKey() {
  const key = process.env.ADVPS_API_KEY;
  if (!key) throw new Error('ADVPS_API_KEY is not set');
  return key;
}

async function httpFetch(path, { method = 'GET', jsonBody, timeoutMs = 60_000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  const url = `${BASE_URL}${path}`;

  const headers = {
    'x-api-key': getApiKey(),
    'Accept': 'application/json',
  };
  if (jsonBody) headers['Content-Type'] = 'application/json';

  console.log('[ADVPS/HTTP] →', { method, url, body: jsonBody });

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: jsonBody ? JSON.stringify(jsonBody) : undefined,
      signal: ac.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    console.log('[ADVPS/HTTP] ←', { status: res.status, bodyPreview: text?.slice(0, 600) });

    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = text; }

    if (!res.ok) {
      const detail = typeof data === 'string' ? data : (data?.message || `HTTP ${res.status}`);
      const rateHint = res.status === 429 ? ' [ADVPS limit: 100 requests / 15 min per API key]' : '';
      throw new Error(`ADVPS ${method} ${path} failed: ${detail}${rateHint}`);
    }

    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('ADVPS API timeout');
    throw new Error(`ADVPS fetch error: ${e.message}`);
  } finally {
    clearTimeout(t);
  }
}

class AdvpsAPI {
  /**
   * Order-details `data.services[]` (ADVPS docs): each item has `id` (Mongo-style document id) and
   * `serviceId` (e.g. "vps_service_1") — the latter is what /api/v1/services/:id uses. Never prefer `id`
   * over `serviceId` for storage or API calls.
   */
  static extractServiceIdFromPurchaseService(svc) {
    if (!svc || typeof svc !== 'object') return '';
    const coerce = (v) => {
      if (v == null || v === '') return '';
      if (typeof v === 'object' && v !== null && '$oid' in v) return String(v.$oid).trim();
      if (typeof v === 'object') return '';
      const s = String(v).trim();
      return s || '';
    };
    const candidates = [
      svc.serviceId,
      svc.service_id,
      svc.serviceID,
      svc.slug,
      svc.uuid,
      svc.id,
      svc._id,
    ];
    for (const c of candidates) {
      const out = coerce(c);
      if (out) return out;
    }
    return '';
  }

  start(serviceId) {
    return httpFetch(`/api/v1/services/${serviceId}/start`, { method: 'POST' });
  }

  stop(serviceId) {
    return httpFetch(`/api/v1/services/${serviceId}/stop`, { method: 'POST' });
  }

  reboot(serviceId) {
    return httpFetch(`/api/v1/services/${serviceId}/reboot`, { method: 'POST' });
  }

  status(serviceId) {
    return httpFetch(`/api/v1/services/${serviceId}/status`, { method: 'GET' });
  }

  getIp(serviceId) {
    return httpFetch(`/api/v1/services/${serviceId}/get-ip`, { method: 'POST' });
  }

  generatePassword(serviceId) {
    return httpFetch(`/api/v1/services/${serviceId}/generate-password`, { method: 'POST' });
  }

  rebuild(serviceId, os) {
    return httpFetch(`/api/v1/services/${serviceId}/rebuild`, { method: 'POST', jsonBody: { os } });
  }

  taskStatus(taskId) {
    return httpFetch(`/api/v1/services/task/${taskId}/status`, { method: 'GET' });
  }

  productStock({ type, page = 1, limit = 100 } = {}) {
    let path = `/api/v1/products/stock?page=${page}&limit=${limit}`;
    if (type) path += `&type=${type}`;
    return httpFetch(path, { method: 'GET' });
  }

  /**
   * Fetch every product row for a type (ADVPS paginates; callers must merge pages or OOS/sync will be wrong).
   */
  async productStockAll({ type, limit = 100 } = {}) {
    const all = [];
    let page = 1;
    while (true) {
      const res = await this.productStock({ type, page, limit });
      const batch = res?.data?.stock || [];
      all.push(...batch);
      const p = res?.data?.pagination;
      const lastPage =
        batch.length === 0 ||
        batch.length < limit ||
        p?.hasNext === false ||
        (typeof p?.totalPages === 'number' && page >= p.totalPages);
      if (lastPage) break;
      page += 1;
      if (page > 500) break;
    }
    return all;
  }

  productStockById(id) {
    return httpFetch(`/api/v1/products/stock/${id}`, { method: 'GET' });
  }

  async listOs(type) {
    const key = type ? String(type) : '_';
    const hit = listOsCache.get(key);
    if (hit && Date.now() < hit.expires) return hit.payload;

    let path = '/api/v1/os';
    if (type) path += `?type=${type}`;
    const payload = await httpFetch(path, { method: 'GET' });
    listOsCache.set(key, { expires: Date.now() + LIST_OS_CACHE_TTL_MS, payload });
    return payload;
  }

  purchaseLinux({ productId, ram, osId, quantity = 1, validity = 30, remark }) {
    return httpFetch('/api/v1/purchase/linux', {
      method: 'POST',
      jsonBody: { productId, ram, osId, quantity, validity, remark },
      timeoutMs: 120_000,
    });
  }

  purchaseVps({ productId, ram, osId, quantity = 1, name, email, validity = 30, remark }) {
    return httpFetch('/api/v1/purchase/vps', {
      method: 'POST',
      jsonBody: { productId, ram, osId, quantity, name, email, validity, remark },
      timeoutMs: 120_000,
    });
  }

  getOrderDetails(orderId) {
    return httpFetch(`/api/v1/purchase/${encodeURIComponent(orderId)}`, { method: 'GET' });
  }
}

module.exports = AdvpsAPI;
