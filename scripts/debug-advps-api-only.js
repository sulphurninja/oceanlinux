require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const AdvpsAPI = require('../src/services/advpsApi');

const serviceId = process.argv[2] || 'WMTIMS';
const purchaseId = process.argv[3] || 'VPS130626-7437';

function mask(v) {
  const s = String(v || '');
  if (!s) return '(empty)';
  return `${s.slice(0, 2)}***${s.slice(-2)} (${s.length} chars)`;
}

function findPasswordFields(obj, path = '') {
  if (!obj || typeof obj !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (/pass/i.test(k) && typeof v === 'string') out.push(`${p}=${mask(v)}`);
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...findPasswordFields(v, p));
  }
  return out;
}

(async () => {
  const api = new AdvpsAPI();
  console.log('Service:', serviceId, 'Purchase:', purchaseId);

  try {
    const statusRes = await api.status(serviceId);
    const svc = statusRes?.data?.service || statusRes?.data || {};
    console.log('\nSTATUS ip:', svc.ip || statusRes?.data?.ip);
    console.log('STATUS username:', svc.username);
    console.log('STATUS password fields:', findPasswordFields(statusRes).join(', ') || '(none)');
  } catch (e) {
    console.log('STATUS ERROR:', e.message);
  }

  try {
    const purchaseRes = await api.getOrderDetails(purchaseId);
    const services = purchaseRes?.data?.services || [];
    const svc = services[0] || {};
    console.log('\nPURCHASE services:', services.length);
    console.log('PURCHASE serviceId:', svc.serviceId);
    console.log('PURCHASE ip:', svc.ip);
    console.log('PURCHASE username:', svc.username);
    console.log('PURCHASE password fields:', findPasswordFields(purchaseRes).join(', ') || '(none)');
  } catch (e) {
    console.log('PURCHASE ERROR:', e.message);
  }
})();
