/**
 * One-shot: sync all active SmartVPS orders from panel status() — expiry + creds.
 * Usage: bun scripts/sync-all-smartvps-expiries.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const SmartVpsAPI = require('../src/services/smartvpsApi');
const {
  extractIpFromAddress,
  buildSmartVpsStatusOrderUpdates,
} = require('../src/lib/smartvpsOrderSync');

function isSmartVpsStock(ipStock) {
  if (!ipStock) return false;
  const tags = Array.isArray(ipStock?.tags) ? ipStock.tags.map((t) => String(t).toLowerCase()) : [];
  const provider = String(ipStock?.provider || '').toLowerCase();
  const name = String(ipStock?.name || '').toLowerCase();
  const hasSmartvpsConfig = !!(
    ipStock?.defaultConfigurations?.smartvps ||
    ipStock?.defaultConfigurations?.get?.('smartvps')
  );
  return (
    tags.includes('smartvps') ||
    tags.includes('ocean linux') ||
    provider === 'smartvps' ||
    name.includes('smartvps') ||
    name.startsWith('🌊') ||
    hasSmartvpsConfig
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const Order = require('../src/models/orderModel').default;
  const IPStock = require('../src/models/ipStockModel');
  const api = new SmartVpsAPI();

  const candidates = await Order.find({
    ipStockId: { $exists: true, $ne: null },
    ipAddress: { $exists: true, $ne: null, $nin: [null, ''] },
    status: { $in: ['active', 'confirmed'] },
  })
    .select('_id ipAddress ipStockId provider expiryDate customerEmail productName')
    .lean();

  const stockIds = [...new Set(candidates.map((o) => String(o.ipStockId)).filter(Boolean))];
  const stocks = await IPStock.find({ _id: { $in: stockIds } }).lean();
  const stockMap = new Map(stocks.map((s) => [String(s._id), s]));

  const orders = candidates.filter((o) => {
    if (String(o.provider || '').toLowerCase() === 'smartvps') return true;
    return isSmartVpsStock(stockMap.get(String(o.ipStockId)));
  });

  console.log(`SmartVPS orders to sync: ${orders.length}`);

  let ok = 0;
  let expirySynced = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const ip = extractIpFromAddress(order.ipAddress);
    if (!ip) {
      failed += 1;
      errors.push({ orderId: String(order._id), error: 'no ip' });
      continue;
    }

    process.stdout.write(`[${i + 1}/${orders.length}] ${ip} ... `);

    try {
      const raw = await api.status(ip);
      const { update, panelExpiry, expirySynced: gotExpiry } = buildSmartVpsStatusOrderUpdates(
        order,
        raw,
        { updateCreds: true }
      );
      await Order.findByIdAndUpdate(order._id, update);
      ok += 1;
      if (gotExpiry) expirySynced += 1;
      console.log(
        gotExpiry
          ? `OK expiry=${panelExpiry.toISOString()}`
          : 'OK (no ExpiryDate in panel response)'
      );
    } catch (err) {
      failed += 1;
      errors.push({ orderId: String(order._id), ip, error: err.message });
      console.log(`FAIL ${err.message}`);
    }

    if (i < orders.length - 1) await sleep(500);
  }

  console.log('\n--- Done ---');
  console.log({ total: orders.length, ok, expirySynced, failed });
  if (errors.length) {
    console.log('Errors (first 20):');
    console.log(JSON.stringify(errors.slice(0, 20), null, 2));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
