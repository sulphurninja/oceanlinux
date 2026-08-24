const mongoose = require('mongoose');
const { DEFAULT_PRICING_GB, toPlainMemoryOptions } = require('../src/lib/smartvpsPackageRam');

function norm(m) {
  const x = String(m || '').match(/(\d+)\s*gb/i);
  return x ? `${x[1]}GB` : String(m || '');
}
function tierPrice(mo, m) {
  const p = toPlainMemoryOptions(mo);
  const k = norm(m);
  if (p[k]?.price > 0) return p[k].price;
  for (const [k2, v] of Object.entries(p)) {
    const x = String(k2).match(/(\d+)\s*gb/i);
    if (x && `${x[1]}GB` === k && v?.price > 0) return v.price;
  }
  return null;
}
function locked(o) {
  const orig = Number(o.originalPrice) || 0;
  if (orig > 0) return orig;
  const paid = Number(o.price) || 0;
  const promo = Number(o.promoDiscount) || 0;
  return paid + promo || paid;
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;
  const stocks = await db.collection('ipstocks').find({
    tags: 'ocean linux',
    name: /^🌊 /,
    'defaultConfigurations.smartvps.provider': 'smartvps',
  }).toArray();
  const stockIds = stocks.map((s) => s._id);
  const orders = await db.collection('orders').find({ ipStockId: { $in: stockIds } })
    .project({
      productName: 1, memory: 1, price: 1, originalPrice: 1, promoDiscount: 1,
      ipStockId: 1, renewalPayments: 1, createdAt: 1, ipAddress: 1, transactionId: 1,
    }).toArray();

  console.log('=== ALL 28 PLANS — CURRENT 16GB / 8GB PRICES ===');
  for (const s of stocks.sort((a, b) => a.name.localeCompare(b.name))) {
    const p16 = tierPrice(s.memoryOptions, '16GB');
    const p8 = tierPrice(s.memoryOptions, '8GB');
    const flags = [];
    if (p16 === DEFAULT_PRICING_GB[16]) flags.push('16GB@default1499');
    if (p8 === DEFAULT_PRICING_GB[8]) flags.push('8GB@default999');
    console.log(`${s.name} | 16GB=${p16 ?? '-'} | 8GB=${p8 ?? '-'}${flags.length ? ' ⚠ ' + flags.join(',') : ''}`);
  }

  const planLoss = {};
  for (const o of orders) {
    const stock = stocks.find((s) => String(s._id) === String(o.ipStockId));
    if (!stock) continue;
    const name = stock.name;
    const mem = norm(o.memory);
    const gb = Number(mem.replace('GB', '')) || 0;
    const def = DEFAULT_PRICING_GB[gb];
    const lock = locked(o);
    const promo = Number(o.promoDiscount) || 0;

    if (!planLoss[name]) {
      planLoss[name] = { renewals: 0, renewalLoss: 0, firstBuys: 0, firstBuyLoss: 0, orderIds: new Set() };
    }

    for (const rp of o.renewalPayments || []) {
      const exp = lock - promo;
      const paid = Number(rp.amount) || 0;
      if (exp > 0 && paid > 0 && paid < exp - 1) {
        planLoss[name].renewals++;
        planLoss[name].renewalLoss += exp - paid;
        planLoss[name].orderIds.add(String(o._id));
      }
    }

    const samePlan = orders.filter(
      (x) => String(x.ipStockId) === String(stock._id) && norm(x.memory) === mem
    );
    const maxList = Math.max(...samePlan.map(locked).filter((x) => x > 0), 0);
    const paid = Number(o.price) || 0;
    const expPaid = maxList - promo;
    if (maxList > def && lock <= def && paid > 0 && expPaid - paid > 0) {
      planLoss[name].firstBuys++;
      planLoss[name].firstBuyLoss += expPaid - paid;
      planLoss[name].orderIds.add(String(o._id));
    }
  }

  console.log('\n=== LOSS BY PLAN ===');
  let tr = 0;
  let tf = 0;
  const rows = Object.entries(planLoss)
    .filter(([, v]) => v.renewalLoss || v.firstBuyLoss)
    .sort((a, b) => (b[1].renewalLoss + b[1].firstBuyLoss) - (a[1].renewalLoss + a[1].firstBuyLoss));

  for (const [name, v] of rows) {
    tr += v.renewalLoss;
    tf += v.firstBuyLoss;
    console.log({
      plan: name,
      renewals: v.renewals,
      renewalLossRs: v.renewalLoss,
      firstBuys: v.firstBuys,
      firstBuyLossRs: v.firstBuyLoss,
      totalRs: v.renewalLoss + v.firstBuyLoss,
      uniqueOrders: v.orderIds.size,
    });
  }

  const uniqueRenewalOrders = new Set();
  for (const o of orders) {
    const lock = locked(o);
    const promo = Number(o.promoDiscount) || 0;
    const exp = lock - promo;
    for (const rp of o.renewalPayments || []) {
      if (Number(rp.amount) > 0 && Number(rp.amount) < exp - 1) {
        uniqueRenewalOrders.add(String(o._id));
      }
    }
  }

  console.log('\n=== TOTALS ===');
  console.log({
    renewalTransactions: tr > 0 ? rows.reduce((s, [, v]) => s + v.renewals, 0) : 0,
    uniqueOrdersUnderchargedRenewal: uniqueRenewalOrders.size,
    renewalLossRs: tr,
    firstPurchaseLossRs: tf,
    combinedLossRs: tr + tf,
  });

  await mongoose.disconnect();
})();
