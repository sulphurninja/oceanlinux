/**
 * Today's gateway payment breakdown (IST) — compare with Razorpay dashboard.
 * Run: node scripts/today-gateway-breakdown.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const IST = 'Asia/Kolkata';
const istDayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: IST });
const todayKey = istDayKey(new Date());
const rangeStart = new Date(`${todayKey}T00:00:00.000+05:30`);
const rangeEnd = new Date(`${todayKey}T23:59:59.999+05:30`);

function gatewayKey(source) {
  return (
    source.transactionId ||
    source.gatewayOrderId ||
    source.clientTxnId ||
    source.paymentId ||
    source.renewalTxnId ||
    null
  );
}

function inRange(date) {
  const d = new Date(date);
  return d >= rangeStart && d <= rangeEnd;
}

function isCartChild(order) {
  return Boolean(order.parentTxnId || order.checkoutSessionId);
}

function standaloneGatewayAmount(order) {
  const price = Number(order.price) || 0;
  const method = String(order.paymentMethod || '').toLowerCase();
  const walletAmt =
    Number(order.paymentDetails?.walletAmount) ||
    (order.walletDeduction?.deducted ? Number(order.walletDeduction.amount) : 0) ||
    0;
  let gatewayAmt = Number(order.paymentDetails?.gatewayAmount) || 0;

  if (method === 'wallet' || order.paymentDetails?.walletOnly) return 0;
  if (walletAmt > 0 && gatewayAmt > 0) return gatewayAmt;
  if (walletAmt > 0 && !gatewayAmt) return Math.max(0, price - walletAmt);
  return gatewayAmt || price;
}

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);

  const Order = mongoose.connection.collection('orders');
  const WalletRecharge = mongoose.connection.collection('walletrecharges');
  const CheckoutSession = mongoose.connection.collection('checkoutsessions');

  const captures = new Map();

  function addCapture(key, amount, bucket, extra = '') {
    if (!key || !(amount > 0)) return;
    if (captures.has(String(key))) return;
    captures.set(String(key), { amount, bucket, extra });
  }

  const orders = await Order.find({
    status: { $in: ['confirmed', 'active', 'paid', 'completed'] },
    $or: [
      { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
      { 'paymentDetails.confirmedAt': { $gte: rangeStart, $lte: rangeEnd } },
      { 'renewalPayments.paidAt': { $gte: rangeStart, $lte: rangeEnd } },
    ],
  }).toArray();

  for (const order of orders) {
    if (!isCartChild(order)) {
      const confirmedAt = order.paymentDetails?.confirmedAt || order.createdAt;
      if (!inRange(confirmedAt)) continue;
      const amt = standaloneGatewayAmount(order);
      if (amt > 0) {
        addCapture(
          gatewayKey(order),
          amt,
          'new-vps-single',
          `${order.productName} · ${order.paymentMethod || '?'}`
        );
      }
    }

    for (const renewal of order.renewalPayments || []) {
      if (!inRange(renewal.paidAt)) continue;
      const total = Number(renewal.amount) || 0;
      const gw =
        Number(renewal.paymentDetails?.gatewayAmount) ||
        (String(renewal.paymentMethod || '').includes('wallet') ? 0 : total);
      if (gw > 0) {
        addCapture(
          gatewayKey(renewal),
          gw,
          'renewal',
          `${order.productName} · ${renewal.paymentMethod || '?'}`
        );
      }
    }
  }

  const sessions = await CheckoutSession.find({
    status: 'confirmed',
    $or: [
      { confirmedAt: { $gte: rangeStart, $lte: rangeEnd } },
      { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
    ],
  }).toArray();

  for (const session of sessions) {
    const when = session.confirmedAt || session.createdAt;
    if (!inRange(when)) continue;
    const gw = Number(session.gatewayAmount) || 0;
    if (gw > 0) {
      addCapture(
        gatewayKey(session),
        gw,
        'cart-checkout',
        `${session.orderIds?.length || 0} VPS · ${session.paymentMethod || '?'}`
      );
    }
  }

  const recharges = await WalletRecharge.find({
    status: 'confirmed',
    $or: [
      { creditedAt: { $gte: rangeStart, $lte: rangeEnd } },
      { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
    ],
  }).toArray();

  for (const recharge of recharges) {
    const when = recharge.creditedAt || recharge.createdAt;
    if (!inRange(when)) continue;
    const amt = Number(recharge.amount) || 0;
    if (amt > 0) {
      addCapture(
        gatewayKey(recharge),
        amt,
        'wallet-topup',
        recharge.paymentMethod || '?'
      );
    }
  }

  const vpsOrderCount = orders.filter((o) => {
    if (isCartChild(o)) return inRange(o.createdAt);
    const confirmedAt = o.paymentDetails?.confirmedAt || o.createdAt;
    return inRange(confirmedAt);
  }).length;

  const byBucket = {};
  let total = 0;
  let razorpayCount = 0;
  let razorpayTotal = 0;
  const razorpayBuckets = {};

  for (const [key, row] of captures.entries()) {
    byBucket[row.bucket] = byBucket[row.bucket] || { count: 0, amount: 0 };
    byBucket[row.bucket].count += 1;
    byBucket[row.bucket].amount += row.amount;
    total += row.amount;

    const isRz =
      String(row.extra).toLowerCase().includes('razorpay') ||
      String(key).startsWith('pay_') ||
      String(key).startsWith('order_');
    if (isRz) {
      razorpayCount += 1;
      razorpayTotal += row.amount;
      razorpayBuckets[row.bucket] = razorpayBuckets[row.bucket] || { count: 0, amount: 0 };
      razorpayBuckets[row.bucket].count += 1;
      razorpayBuckets[row.bucket].amount += row.amount;
    }
  }

  console.log('='.repeat(50));
  console.log('Date (IST):', todayKey);
  console.log('VPS order lines today:', vpsOrderCount);
  console.log('Unique gateway captures:', captures.size);
  console.log('Total collected (all gateways):', '₹' + Math.round(total).toLocaleString('en-IN'));
  console.log('='.repeat(50));
  console.log('\nBreakdown:');
  for (const [bucket, data] of Object.entries(byBucket)) {
    console.log(
      `  ${bucket}: ${data.count} payments · ₹${Math.round(data.amount).toLocaleString('en-IN')}`
    );
  }

  console.log('\n--- Razorpay dashboard match ---');
  console.log('Razorpay captures:', razorpayCount, '· ₹' + Math.round(razorpayTotal).toLocaleString('en-IN'));
  for (const [bucket, data] of Object.entries(razorpayBuckets)) {
    console.log(
      `  ${bucket}: ${data.count} · ₹${Math.round(data.amount).toLocaleString('en-IN')}`
    );
  }

  const nonRz = total - razorpayTotal;
  if (nonRz > 0) {
    console.log('\nNon-Razorpay (Cashfree/UPI):', '₹' + Math.round(nonRz).toLocaleString('en-IN'));
  }

  console.log('\nSample captures (first 10):');
  [...captures.entries()].slice(0, 10).forEach(([k, v]) => {
    console.log(`  ${k.slice(0, 24)}… ₹${v.amount} [${v.bucket}] ${v.extra}`);
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
