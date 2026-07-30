/**
 * List every "All Gateway" capture today with type + Razorpay vs Other.
 * Run: node scripts/today-all-gateway-detail.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const IST = 'Asia/Kolkata';
const istDayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: IST });
const todayKey = istDayKey(new Date());
const rangeStart = new Date(`${todayKey}T00:00:00.000+05:30`);
const rangeEnd = new Date(`${todayKey}T23:59:59.999+05:30`);

function inRange(date) {
  const d = new Date(date);
  return d >= rangeStart && d <= rangeEnd;
}

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

function isCartChild(order) {
  return Boolean(order.parentTxnId || order.checkoutSessionId);
}

function isRazorpay(source) {
  const method = String(source.paymentMethod || '').toLowerCase();
  if (method === 'wallet' || (method.startsWith('wallet') && !method.includes('razorpay'))) {
    return false;
  }
  if (method.includes('razorpay')) return true;
  const txnId = String(source.transactionId || source.paymentId || '');
  const gwOrderId = String(source.gatewayOrderId || '');
  return txnId.startsWith('pay_') || gwOrderId.startsWith('order_');
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

const BUCKET_LABEL = {
  vps: 'Naya VPS (single buy)',
  cart: 'Cart checkout',
  renewal: 'Renewal',
  topup: 'Wallet top-up',
};

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const Order = mongoose.connection.collection('orders');
  const WalletRecharge = mongoose.connection.collection('walletrecharges');
  const CheckoutSession = mongoose.connection.collection('checkoutsessions');

  const captures = new Map();

  function add(source, amount, bucket, label, method) {
    const key = gatewayKey(source);
    if (!key || !(amount > 0)) return;
    const keyStr = String(key);
    if (captures.has(keyStr)) return;
    captures.set(keyStr, {
      amount,
      bucket,
      label,
      method: method || source.paymentMethod || '?',
      gateway: isRazorpay(source) ? 'Razorpay' : 'Other',
      key: keyStr,
    });
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
        add(order, amt, 'vps', order.productName, order.paymentMethod);
      }
    }
    for (const renewal of order.renewalPayments || []) {
      if (!inRange(renewal.paidAt)) continue;
      const total = Number(renewal.amount) || 0;
      const gw =
        Number(renewal.paymentDetails?.gatewayAmount) ||
        (String(renewal.paymentMethod || '').includes('wallet') ? 0 : total);
      if (gw > 0) {
        add(renewal, gw, 'renewal', order.productName, renewal.paymentMethod);
      }
    }
  }

  const sessions = await CheckoutSession.find({ status: 'confirmed' }).toArray();
  for (const session of sessions) {
    const when = session.confirmedAt || session.createdAt;
    if (!inRange(when)) continue;
    const gw = Number(session.gatewayAmount) || 0;
    if (gw > 0) {
      add(
        session,
        gw,
        'cart',
        `${session.orderIds?.length || 0} VPS in cart`,
        session.paymentMethod
      );
    }
  }

  const recharges = await WalletRecharge.find({ status: 'confirmed' }).toArray();
  for (const recharge of recharges) {
    const when = recharge.creditedAt || recharge.createdAt;
    if (!inRange(when)) continue;
    const amt = Number(recharge.amount) || 0;
    if (amt > 0) add(recharge, amt, 'topup', 'Wallet recharge', recharge.paymentMethod);
  }

  const rows = [...captures.values()];
  const byBucket = {};
  const byGateway = { Razorpay: { n: 0, a: 0 }, Other: { n: 0, a: 0 } };
  let total = 0;

  for (const row of rows) {
    byBucket[row.bucket] = byBucket[row.bucket] || { n: 0, a: 0 };
    byBucket[row.bucket].n += 1;
    byBucket[row.bucket].a += row.amount;
    byGateway[row.gateway].n += 1;
    byGateway[row.gateway].a += row.amount;
    total += row.amount;
  }

  console.log('Date (IST):', todayKey);
  console.log('ALL GATEWAY TOTAL:', rows.length, 'captures · ₹' + Math.round(total).toLocaleString('en-IN'));
  console.log('\n=== Type wise (kya kya hai) ===');
  for (const [bucket, data] of Object.entries(byBucket)) {
    console.log(`  ${BUCKET_LABEL[bucket] || bucket}: ${data.n} · ₹${Math.round(data.a).toLocaleString('en-IN')}`);
  }
  console.log('\n=== Razorpay vs Other ===');
  console.log(`  Razorpay: ${byGateway.Razorpay.n} · ₹${Math.round(byGateway.Razorpay.a).toLocaleString('en-IN')}`);
  console.log(`  Other:    ${byGateway.Other.n} · ₹${Math.round(byGateway.Other.a).toLocaleString('en-IN')}`);

  const others = rows.filter((r) => r.gateway === 'Other');
  if (others.length) {
    console.log('\n=== "Other" wale (Cashfree/UPI nahi — mostly wallet+wallet galat count) ===');
    for (const r of others) {
      console.log(
        `  ₹${r.amount} · ${BUCKET_LABEL[r.bucket]} · method=${r.method} · key=${r.key.slice(0, 28)}`
      );
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
