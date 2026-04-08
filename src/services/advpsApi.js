const BASE_URL = 'https://api.advps.org';

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
      throw new Error(`ADVPS ${method} ${path} failed: ${detail}`);
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

  listOs() {
    return httpFetch('/api/v1/os', { method: 'GET' });
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
