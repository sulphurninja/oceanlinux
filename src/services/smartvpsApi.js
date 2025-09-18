// /src/services/smartvpsApi.js
// Uses BASIC AUTH built from SMARTVPS_USERNAME + SMARTVPS_PASSWORD
// Sends JSON for POST endpoints (per SmartVPS docs) and POST for ipstock (per your working tests).

const BASE_URL =
  (process.env.SMARTVPS_BASE_URL || 'https://smartvps.online/')
    .replace(/\/+$/, '/');

function mask(s, keepStart = 3) {
  if (!s) return '(missing)';
  const str = String(s);
  if (str.length <= keepStart) return str[0] + '***';
  return str.slice(0, keepStart) + '***';
}

function buildAuthHeader() {
  const u = process.env.SMARTVPS_USERNAME;
  const p = process.env.SMARTVPS_PASSWORD;
  if (!u || !p) {
    throw new Error('SMARTVPS auth missing: set SMARTVPS_USERNAME and SMARTVPS_PASSWORD');
  }
  const b64 = Buffer.from(`${u}:${p}`).toString('base64');
  return `Basic ${b64}`;
}

async function httpFetch(path, { method = 'POST', jsonBody, query } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);

  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }

  // LOG request
  console.log('[SMARTVPS/HTTP] →', {
    method,
    url: url.toString(),
    headers: {
      Authorization: `Basic ${mask((process.env.SMARTVPS_USERNAME || '') + ':' + (process.env.SMARTVPS_PASSWORD || ''))}`,
      Accept: 'application/json',
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined
  });

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': buildAuthHeader(),
        'Accept': 'application/json',
        ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
        'User-Agent': 'oceanlinux/1.0 (+nextjs)'
      },
      body: jsonBody ? JSON.stringify(jsonBody) : undefined,
      signal: ac.signal,
      cache: 'no-store',
    });

    const text = await res.text();

    // LOG response
    console.log('[SMARTVPS/HTTP] ←', {
      status: res.status,
      ok: res.ok,
      bodyPreview: text?.slice(0, 800) // cap to avoid noise
    });

    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = text; }

    if (!res.ok) {
      const detail = typeof data === 'string' ? data : (data?.message || data?.error || `HTTP ${res.status}`);
      throw new Error(`SmartVPS ${method} ${url.pathname} failed: ${detail}`);
    }

    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('SmartVPS API timeout');
    throw new Error(`SmartVPS fetch error: ${e.message}`);
  } finally {
    clearTimeout(t);
  }
}

class SmartVpsAPI {
  constructor() {
    console.log('[SMARTVPS] Client init', {
      BASE_URL,
      userMasked: mask(process.env.SMARTVPS_USERNAME),
      passMasked: mask(process.env.SMARTVPS_PASSWORD),
    });
  }

  // Per your working tests, ipstock is POST under /api/oceansmart/ipstock
  ipstock() { return httpFetch('api/oceansmart/ipstock', { method: 'POST' }); }

  // Power
  start(ip) { return httpFetch('api/oceansmart/start', { jsonBody: { ip } }); }
  stop(ip) { return httpFetch('api/oceansmart/stop', { jsonBody: { ip } }); }
  format(ip) { return httpFetch('api/oceansmart/format', { jsonBody: { ip } }); }
  status(ip) { return httpFetch('api/oceansmart/status', { jsonBody: { ip } }); }

  // OS change — os ∈ {2012,2016,2019,2022,11,centos,ubuntu}
  changeOS(ip, os) { return httpFetch('api/oceansmart/changeos', { jsonBody: { ip, os } }); }

  // Buy (call ipstock first and pick a usable IP; ram string/number)
  buyVps(ip, ram) { return httpFetch('api/oceansmart/buyvps', { jsonBody: { ip, ram: String(ram) } }); }

  // Renew VPS - NEW METHOD
  renewVps(ip) {
    console.log('[SMARTVPS] Renewing VPS for IP:', ip);
    return httpFetch('api/oceansmart/renewvps', { jsonBody: { ip } });
  }

}

module.exports = SmartVpsAPI;
