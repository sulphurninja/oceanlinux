/**
 * Debug ADVPS password sync — masks secrets in output.
 * Usage: node scripts/debug-advps-password-sync.js [orderId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const AdvpsAPI = require('../src/services/advpsApi');
const { unwrapAdvpsEnvelope } = require('../src/lib/advpsStatusNormalize');

const orderId = process.argv[2] || '6a2d5d9755e48a7a4883c404';

function extractStatusCreds(statusPayload, order) {
  const d = unwrapAdvpsEnvelope(statusPayload) || {};
  const svc = d.service || d;
  return {
    ip: svc?.ip || d.ip || '',
    username: svc?.username || svc?.user || '',
    password: svc?.password || svc?.pass || svc?.rootPassword || d?.password || '',
  };
}

function mask(v) {
  const s = String(v || '');
  if (!s) return '(empty)';
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}***${s.slice(-2)} (${s.length} chars)`;
}

function passwordKeys(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return [];
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (/pass/i.test(k) && typeof v === 'string' && v) keys.push({ path, value: mask(v) });
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...passwordKeys(v, path));
    }
  }
  return keys;
}

async function main() {
  const uri = process.env.MONGOOSE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);

  const order = await mongoose.connection.db.collection('orders').findOne({
    _id: new mongoose.Types.ObjectId(orderId),
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  console.log('\n=== ORDER (DB) ===');
  console.log('advpsServiceId:', order.advpsServiceId);
  console.log('advpsOrderId:', order.advpsOrderId);
  console.log('ipAddress:', order.ipAddress);
  console.log('username:', order.username);
  console.log('password:', mask(order.password));

  const api = new AdvpsAPI();
  const serviceId = order.advpsServiceId;

  if (serviceId) {
    console.log('\n=== STATUS API ===');
    try {
      const statusRes = await api.status(serviceId);
      const creds = extractStatusCreds(statusRes, order);
      console.log('extracted ip:', creds.ip);
      console.log('extracted username:', creds.username);
      console.log('extracted password:', mask(creds.password));
      console.log('password keys in response:', passwordKeys(statusRes?.data || statusRes));
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  }

  if (order.advpsOrderId) {
    console.log('\n=== PURCHASE API ===');
    try {
      const detailsRes = await api.getOrderDetails(order.advpsOrderId);
      const root = detailsRes?.data ?? detailsRes ?? {};
      const services = root.services ?? root.order?.services ?? [];
      const svc = services.find((s) => {
        const sid = String(s?.serviceId || s?.id || '').toLowerCase();
        return sid === String(order.advpsServiceId || '').toLowerCase();
      }) || services[0];
      const creds = {
        ip: svc?.ip || '',
        username: svc?.username || '',
        password: svc?.password || svc?.pass || '',
      };
      console.log('services count:', services.length);
      console.log('matched serviceId:', svc?.serviceId || svc?.id || '(none)');
      console.log('extracted ip:', creds.ip);
      console.log('extracted username:', creds.username);
      console.log('extracted password:', mask(creds.password));
      console.log('password keys in response:', passwordKeys(detailsRes?.data || detailsRes));
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
