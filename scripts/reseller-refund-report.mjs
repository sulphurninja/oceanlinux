import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

function mapToObj(m) {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  return m;
}

function calcExpectedPrice(customPrices, globalMarkup, productId, memory, basePrice) {
  const keys = [`${productId}_${memory}`];
  for (const k of keys) {
    const custom = Number(customPrices[k]);
    if (custom > 0) return custom;
  }
  let price = basePrice;
  if (globalMarkup?.enabled) {
    if (globalMarkup.type === 'percentage') price += basePrice * (globalMarkup.value / 100);
    else if (globalMarkup.type === 'fixed') price += globalMarkup.value;
  }
  return Math.ceil(price);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGOOSE_URL || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const Reseller = mongoose.connection.collection('resellers');
  const Order = mongoose.connection.collection('orders');

  const emailQuery = process.argv[2] || 'skodia.in@gmail.com';
  const reseller = await Reseller.findOne({ email: new RegExp(emailQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });

  if (!reseller) {
    console.log('Reseller not found for', email);
    await mongoose.disconnect();
    return;
  }

  const customPrices = mapToObj(reseller.pricing?.customPrices);
  const globalMarkup = reseller.pricing?.globalMarkup || {};

  console.log('\n=== RESELLER ===');
  console.log('Name:', reseller.businessName);
  console.log('Email:', reseller.email);
  console.log('ID:', reseller._id.toString());
  console.log('Status:', reseller.status);
  console.log('Reseller updatedAt:', reseller.updatedAt);
  console.log('Wallet balance:', reseller.wallet?.balance);
  console.log('\nCustom prices set:');
  for (const [k, v] of Object.entries(customPrices)) {
    console.log(`  ${k} => ₹${v}`);
  }

  const orders = await Order.find({ resellerId: reseller._id }).sort({ createdAt: 1 }).toArray();

  console.log('\n=== ORDERS:', orders.length, '===\n');

  let totalOverpaid = 0;
  const rows = [];

  for (const o of orders) {
    const base = Number(o.pricing?.basePrice ?? o.originalPrice ?? 0);
    const paid = Number(o.price ?? 0);
    const productId = String(o.ipStockId || o.slotIpPackageId || '');
    const memory = String(o.memory || '');

    const expectedCustom = calcExpectedPrice(customPrices, globalMarkup, productId, memory, base);
    const hasCustomKey = Object.keys(customPrices).some((k) => k.startsWith(`${productId}_`));
    const customForPlan = customPrices[`${productId}_${memory}`];

    let rateType = 'standard';
    if (customForPlan > 0 && paid === expectedCustom) rateType = 'custom_price';
    else if (customForPlan > 0 && paid > expectedCustom) rateType = 'OVERPAID_vs_custom';
    else if (hasCustomKey && paid > expectedCustom) rateType = 'OVERPAID_vs_custom';
    else if (paid > base && !customForPlan) rateType = 'markup_or_standard';

    const refundDue = customForPlan > 0 && paid > expectedCustom ? paid - expectedCustom : 0;
    if (refundDue > 0 && ['confirmed', 'active', 'paid', 'completed'].includes(String(o.status))) {
      totalOverpaid += refundDue;
    }

    rows.push({
      date: o.createdAt,
      id: o._id.toString().slice(-8),
      product: o.productName,
      memory,
      base,
      paid,
      customSet: customForPlan || null,
      expectedAtCustom: customForPlan > 0 ? expectedCustom : null,
      refundDue,
      status: o.status,
      rateType,
    });
  }

  for (const r of rows) {
    console.log(`${r.date?.toISOString?.()?.slice(0, 16) || r.date} | ${r.id} | ${r.status}`);
    console.log(`  ${r.product} (${r.memory})`);
    console.log(`  Base: ₹${r.base} | Paid: ₹${r.paid} | Custom: ${r.customSet ? '₹' + r.customSet : '—'} | Refund: ₹${r.refundDue} | ${r.rateType}`);
    console.log('');
  }

  console.log('=== SUMMARY ===');
  console.log('Orders at custom rate (paid = custom):', rows.filter((r) => r.rateType === 'custom_price').length);
  console.log('Orders overpaid vs current custom:', rows.filter((r) => r.refundDue > 0).length);
  console.log('TOTAL REFUND DUE (if custom applied retroactively): ₹', totalOverpaid);

  const byUserApi = await Order.countDocuments({
    user: reseller.userId,
    'paymentDetails.purchasedViaResellerApi': true,
  });
  console.log('\nAll API orders for linked user:', byUserApi);
  console.log('Reseller stats.totalOrders:', reseller.stats?.totalOrders);

  const grouped = {};
  for (const r of rows.filter((x) => x.refundDue > 0)) {
    const k = `Paid ₹${r.paid} → Custom ₹${r.customSet} (refund ₹${r.refundDue}/order)`;
    grouped[k] = (grouped[k] || 0) + 1;
  }
  console.log('\nRefund breakdown:');
  for (const [k, n] of Object.entries(grouped)) {
    const per = Number(k.match(/refund ₹(\d+)/)?.[1] || 0);
    console.log(`  ${n} orders × ₹${per} = ₹${n * per} | ${k}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
