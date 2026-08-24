/**
 * Audit SmartVPS plans where sync may have lowered admin-set prices,
 * and count renewals / first purchases charged below expected admin rate.
 *
 * Usage: node scripts/audit-smartvps-price-loss.js
 */
const mongoose = require('mongoose');
const { DEFAULT_PRICING_GB, toPlainMemoryOptions } = require('../src/lib/smartvpsPackageRam');

function normalizeMemKey(memory) {
  const m = String(memory || '').match(/(\d+)\s*gb/i);
  return m ? `${m[1]}GB` : String(memory || '').trim();
}

function getTierPrice(memoryOptions, memory) {
  const plain = toPlainMemoryOptions(memoryOptions);
  const key = normalizeMemKey(memory);
  if (plain[key]?.price > 0) return Number(plain[key].price);
  for (const [k, v] of Object.entries(plain)) {
    const m = String(k).match(/(\d+)\s*gb/i);
    if (m && `${m[1]}GB` === key && Number(v?.price) > 0) return Number(v.price);
  }
  return null;
}

function lockedListPrice(order) {
  const paid = Number(order.price) || 0;
  const promo = Number(order.promoDiscount) || 0;
  const original = Number(order.originalPrice) || 0;
  if (original > 0) return original;
  if (paid > 0 && promo > 0) return paid + promo;
  return paid;
}

function gbFromKey(key) {
  const m = String(key).match(/(\d+)\s*gb/i);
  return m ? Number(m[1]) : null;
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const stocks = await db.collection('ipstocks').find({
    tags: 'ocean linux',
    name: /^🌊 /,
    'defaultConfigurations.smartvps.provider': 'smartvps',
  }).toArray();

  console.log(`\n=== SmartVPS Ocean plans: ${stocks.length} ===\n`);

  const stockById = new Map(stocks.map((s) => [String(s._id), s]));
  const adminPriceByStockMem = new Map();

  const planRows = [];

  for (const stock of stocks) {
    const smartvps = stock.defaultConfigurations?.smartvps || {};
    const live = toPlainMemoryOptions(stock.memoryOptions);
    const archived = toPlainMemoryOptions(smartvps.archivedMemoryOptions || {});
    const allKeys = new Set([...Object.keys(live), ...Object.keys(archived)]);

    for (const key of allKeys) {
      const gb = gbFromKey(key);
      const memKey = normalizeMemKey(key);
      const current = getTierPrice(live, memKey);
      const arch = getTierPrice(archived, memKey);
      const defaultPrice = gb != null ? DEFAULT_PRICING_GB[gb] : null;

      const mapKey = `${stock._id}::${memKey}`;
      adminPriceByStockMem.set(mapKey, {
        stockId: String(stock._id),
        stockName: stock.name,
        memory: memKey,
        current,
        archived: arch,
        defaultPrice,
        adminHint: null,
      });
    }
  }

  const smartvpsOrders = await db.collection('orders').find({
    $or: [
      { provider: 'smartvps' },
      { productName: /^🌊 / },
      { ipStockId: { $in: stocks.map((s) => s._id) } },
    ],
  }).project({
    productName: 1,
    memory: 1,
    price: 1,
    originalPrice: 1,
    promoDiscount: 1,
    promoCode: 1,
    ipStockId: 1,
    provider: 1,
    ipAddress: 1,
    status: 1,
    createdAt: 1,
    renewalPayments: 1,
    transactionId: 1,
  }).toArray();

  for (const order of smartvpsOrders) {
    const stockId = order.ipStockId ? String(order.ipStockId) : null;
    if (!stockId || !stockById.has(stockId)) continue;
    const memKey = normalizeMemKey(order.memory);
    const mapKey = `${stockId}::${memKey}`;
    if (!adminPriceByStockMem.has(mapKey)) {
      adminPriceByStockMem.set(mapKey, {
        stockId,
        stockName: stockById.get(stockId).name,
        memory: memKey,
        current: getTierPrice(stockById.get(stockId).memoryOptions, memKey),
        archived: null,
        defaultPrice: null,
        adminHint: null,
      });
    }
    const row = adminPriceByStockMem.get(mapKey);
    const locked = lockedListPrice(order);
    if (locked > (row.adminHint || 0)) row.adminHint = locked;
  }

  for (const row of adminPriceByStockMem.values()) {
    const candidates = [row.adminHint, row.archived, row.current].filter((p) => Number(p) > 0);
    row.expectedAdmin = candidates.length ? Math.max(...candidates) : null;
    const atDefault = row.current != null && row.defaultPrice != null && row.current === row.defaultPrice;
    const belowAdmin =
      row.expectedAdmin != null && row.current != null && row.current < row.expectedAdmin;
    row.suspect = atDefault && belowAdmin;
    row.gapPerRenewal =
      row.expectedAdmin != null && row.current != null && row.current < row.expectedAdmin
        ? row.expectedAdmin - row.current
        : 0;
    if (row.suspect || row.gapPerRenewal > 0) planRows.push(row);
  }

  planRows.sort((a, b) => (b.gapPerRenewal || 0) - (a.gapPerRenewal || 0));

  console.log('PLANS WITH POSSIBLE SYNC PRICE DROP (current < expected admin):');
  console.log('─'.repeat(100));
  let totalGapPerCycle = 0;
  for (const r of planRows) {
    if (!r.gapPerRenewal) continue;
    totalGapPerCycle += r.gapPerRenewal;
    console.log({
      plan: r.stockName,
      memory: r.memory,
      currentDbPrice: r.current,
      systemDefault: r.defaultPrice,
      archivedPrice: r.archived,
      maxFromOrders: r.adminHint,
      expectedAdmin: r.expectedAdmin,
      gapPerMonth: r.gapPerRenewal,
      atSystemDefault: r.suspect,
    });
  }
  if (!planRows.some((r) => r.gapPerRenewal > 0)) {
    console.log('(none with current < expected admin)');
  }

  const renewalHits = [];
  let totalRenewalLoss = 0;

  for (const order of smartvpsOrders) {
    const stockId = order.ipStockId ? String(order.ipStockId) : null;
    const memKey = normalizeMemKey(order.memory);
    const mapKey = stockId ? `${stockId}::${memKey}` : null;
    const tierInfo = mapKey ? adminPriceByStockMem.get(mapKey) : null;
    const locked = lockedListPrice(order);
    const promo = Number(order.promoDiscount) || 0;
    const expectedRenewal = locked > 0 ? locked - promo : null;

    for (const rp of order.renewalPayments || []) {
      const paid = Number(rp.amount) || 0;
      if (!expectedRenewal || paid <= 0) continue;
      if (paid < expectedRenewal - 1) {
        const loss = expectedRenewal - paid;
        totalRenewalLoss += loss;
        renewalHits.push({
          orderId: String(order._id),
          productName: order.productName,
          memory: order.memory,
          ip: order.ipAddress,
          lockedList: locked,
          promo,
          expectedRenewal,
          paidRenewal: paid,
          loss,
          renewalTxnId: rp.renewalTxnId,
          paidAt: rp.paidAt,
          currentDbList: tierInfo?.current ?? null,
        });
      }
    }
  }

  renewalHits.sort((a, b) => b.loss - a.loss || new Date(b.paidAt) - new Date(a.paidAt));

  console.log(`\n=== UNDERCHARGED RENEWALS (paid < first-purchase list − promo): ${renewalHits.length} ===`);
  console.log('─'.repeat(100));
  for (const h of renewalHits) {
    console.log(h);
  }
  console.log(`\nTotal renewal undercharge (sum): ₹${totalRenewalLoss}`);

  const firstPurchaseHits = [];
  let totalFirstPurchaseLoss = 0;

  for (const order of smartvpsOrders) {
    const stockId = order.ipStockId ? String(order.ipStockId) : null;
    const memKey = normalizeMemKey(order.memory);
    const mapKey = stockId ? `${stockId}::${memKey}` : null;
    const tierInfo = mapKey ? adminPriceByStockMem.get(mapKey) : null;
    if (!tierInfo?.expectedAdmin) continue;

    const paid = Number(order.price) || 0;
    const promo = Number(order.promoDiscount) || 0;
    const listAtPurchase = lockedListPrice(order);
    const expectedFirst = tierInfo.expectedAdmin - promo;

    if (listAtPurchase > 0 && listAtPurchase < tierInfo.expectedAdmin - 1 && paid <= expectedFirst + 1) {
      const loss = expectedFirst - paid;
      if (loss > 0) {
        totalFirstPurchaseLoss += loss;
        firstPurchaseHits.push({
          orderId: String(order._id),
          productName: order.productName,
          memory: order.memory,
          ip: order.ipAddress,
          paid,
          listAtPurchase,
          expectedAdminList: tierInfo.expectedAdmin,
          promo,
          expectedPaid: expectedFirst,
          loss,
          createdAt: order.createdAt,
          transactionId: order.transactionId,
        });
      }
    }
  }

  firstPurchaseHits.sort((a, b) => b.loss - a.loss || new Date(b.createdAt) - new Date(a.createdAt));

  console.log(`\n=== FIRST PURCHASES BELOW EXPECTED ADMIN RATE: ${firstPurchaseHits.length} ===`);
  console.log('(only where order list price < max admin hint from other orders/archive/current)');
  console.log('─'.repeat(100));
  for (const h of firstPurchaseHits.slice(0, 50)) {
    console.log(h);
  }
  if (firstPurchaseHits.length > 50) {
    console.log(`... and ${firstPurchaseHits.length - 50} more`);
  }
  console.log(`\nTotal first-purchase undercharge (sum): ₹${totalFirstPurchaseLoss}`);

  console.log('\n=== SUMMARY ===');
  console.log({
    smartvpsPlans: stocks.length,
    plansWithPriceGap: planRows.filter((r) => r.gapPerRenewal > 0).length,
    underchargedRenewals: renewalHits.length,
    renewalLossRs: totalRenewalLoss,
    underchargedFirstPurchases: firstPurchaseHits.length,
    firstPurchaseLossRs: totalFirstPurchaseLoss,
    combinedLossRs: totalRenewalLoss + totalFirstPurchaseLoss,
  });

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
