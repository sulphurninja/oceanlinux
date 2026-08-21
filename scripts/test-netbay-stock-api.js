require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { getCompanyNetbayApiConfig } = require('../src/lib/companyNetbayApi');

function toPlainConfigurations(maybeMap) {
  if (maybeMap == null) return {};
  if (typeof maybeMap === 'object' && !Array.isArray(maybeMap)) {
    if (typeof maybeMap.forEach === 'function' && typeof maybeMap.get === 'function') {
      const out = {};
      maybeMap.forEach((v, k) => { out[k] = v; });
      return out;
    }
    return { ...maybeMap };
  }
  return {};
}

const COMPANY_ID = process.argv[2] || '6a43a82582e9365969847c66';

async function netbayRequest(cfg, path, { query } = {}) {
  let url = `${cfg.baseUrl.replace(/\/+$/, '')}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-API-Key': cfg.apiKey,
      'X-API-Secret': cfg.apiSecret,
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

function resolveOsName(osList) {
  const names = (osList || []).map((o) => (typeof o === 'string' ? o : o?.name || o?.os || '')).filter(Boolean);
  const prefs = ['Ubuntu 22.04', 'Ubuntu 22', 'ubuntu'];
  for (const p of prefs) {
    const hit = names.find((n) => n.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  return names[0] || '';
}

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const company = await db.collection('companies').findOne({
    _id: new mongoose.Types.ObjectId(COMPANY_ID),
  });
  if (!company) {
    console.error('Company not found:', COMPANY_ID);
    process.exit(1);
  }

  const cfg = getCompanyNetbayApiConfig(company);
  if (!cfg) {
    console.error('No Netbay API config for company', company.name);
    process.exit(1);
  }

  console.log('Company:', company.name);
  console.log('Netbay enabled:', company.netbayApi?.enabled);
  console.log('Live stock API:', company.netbayApi?.useLiveStockApi);
  console.log('Base URL:', cfg.baseUrl);

  const stocks = await db
    .collection('ipstocks')
    .find({ company: new mongoose.Types.ObjectId(COMPANY_ID) })
    .limit(10)
    .toArray();

  const stock = stocks.find((s) => {
    const plain = toPlainConfigurations(s.defaultConfigurations);
    const plans = plain?.netbay?.planByMemory;
    if (!plans) return false;
    const obj = plans instanceof Map ? Object.fromEntries(plans) : plans;
    return Object.values(obj || {}).some(Boolean);
  });

  if (!stock) {
    console.error('No Netbay-linked IP stock found for this company');
    process.exit(1);
  }

  const plain = toPlainConfigurations(stock.defaultConfigurations);
  const netbay = plain?.netbay || {};
  const planByMemory = netbay.planByMemory instanceof Map
    ? Object.fromEntries(netbay.planByMemory)
    : netbay.planByMemory || {};
  const memory = Object.keys(planByMemory).find((m) => planByMemory[m]) || Object.keys(planByMemory)[0];
  const planId = planByMemory[memory];
  const groupTag = netbay.groupTag || '';

  console.log('\n--- Auth test (GET /api/v1/plans) ---');
  const plansRes = await netbayRequest(cfg, '/api/v1/plans');
  console.log('Status:', plansRes.status, plansRes.ok ? 'OK' : 'FAIL');
  if (!plansRes.ok) {
    console.log('Body:', JSON.stringify(plansRes.body, null, 2));
    if (plansRes.body?.maintenance) {
      console.log('(Platform maintenance — continuing to test stock endpoint anyway)');
    } else {
      process.exit(1);
    }
  } else {
    console.log('Plans count:', plansRes.body?.data?.plans?.length ?? plansRes.body?.data?.length ?? '?');
  }

  console.log('\n--- OS list (GET /api/v1/os) ---');
  const osRes = await netbayRequest(cfg, '/api/v1/os');
  const osList = osRes.body?.data?.os || osRes.body?.data || [];
  let osName = resolveOsName(Array.isArray(osList) ? osList : []);
  console.log('Status:', osRes.status, '| OS resolved:', osName || '(none)');
  if (!osName) {
    osName = 'Ubuntu 22.04';
    console.log('Using fallback OS:', osName);
  }

  console.log('\n--- Stock check (GET /api/v1/services/stock) ---');
  console.log('Plan:', stock.name, '| memory:', memory, '| planId:', planId, '| groupTag:', groupTag || '(any)');

  if (!planId || !osName) {
    console.error('Missing planId or OS — cannot test stock endpoint');
    process.exit(1);
  }

  const query = { planId, os: osName };
  if (groupTag) query.groupTag = groupTag;

  const stockRes = await netbayRequest(cfg, '/api/v1/services/stock', { query });
  console.log('Status:', stockRes.status);
  console.log('Response:', JSON.stringify(stockRes.body, null, 2));

  if (stockRes.status >= 500) {
    console.log('\n=== RESULT: STOCK API BROKEN (server error) — Live ON pe sab Out of Stock dikhega ===');
  } else if (stockRes.status === 503) {
    console.log('\n=== RESULT: OUT OF STOCK (503 — API working, no capacity) ===');
  } else if (stockRes.ok && stockRes.body?.data?.available === true) {
    console.log('\n=== RESULT: IN STOCK — Live ON safe hai ===');
  } else if (stockRes.ok && stockRes.body?.data?.available === false) {
    console.log('\n=== RESULT: OUT OF STOCK — API working, abhi capacity nahi ===');
  } else {
    console.log('\n=== RESULT: Unexpected response — check body above ===');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
