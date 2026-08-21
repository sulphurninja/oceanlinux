/**
 * Detail for "Other / Cashfree-UPI" line on dashboard (wallet+wallet misclassified).
 * Run: node scripts/today-other-gateway-detail.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const IST = 'Asia/Kolkata';
const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: IST });
const rangeStart = new Date(`${todayKey}T00:00:00.000+05:30`);
const rangeEnd = new Date(`${todayKey}T23:59:59.999+05:30`);

function inRange(d) {
  const x = new Date(d);
  return x >= rangeStart && x <= rangeEnd;
}

function isRazorpay(source) {
  const method = String(source.paymentMethod || '').toLowerCase();
  if (method === 'wallet' || (method.startsWith('wallet') && !method.includes('razorpay'))) return false;
  if (method.includes('razorpay')) return true;
  const txn = String(source.transactionId || source.paymentId || '');
  const gw = String(source.gatewayOrderId || '');
  return txn.startsWith('pay_') || gw.startsWith('order_');
}

function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit' });
}

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const Order = mongoose.connection.collection('orders');
  const others = [];

  const orders = await Order.find({
    status: { $in: ['confirmed', 'active', 'paid', 'completed'] },
    'renewalPayments.paidAt': { $gte: rangeStart, $lte: rangeEnd },
  }).toArray();

  for (const order of orders) {
    for (const r of order.renewalPayments || []) {
      if (!inRange(r.paidAt)) continue;
      if (isRazorpay(r)) continue;

      const gw =
        Number(r.paymentDetails?.gatewayAmount) ||
        (String(r.paymentMethod || '').includes('wallet') && !String(r.paymentMethod || '').includes('razorpay')
          ? 0
          : Number(r.amount) || 0);

      // dashboard logic: computeRenewalAmounts first branch
      let dashGw = 0;
      const gatewayAmt = Number(r.paymentDetails?.gatewayAmount);
      const walletAmt = Number(r.paymentDetails?.walletAmount);
      if (gatewayAmt > 0 || walletAmt > 0) {
        dashGw = gatewayAmt > 0 ? gatewayAmt : Math.max(0, (Number(r.amount) || 0) - walletAmt);
      } else {
        const method = String(r.paymentMethod || '').toLowerCase();
        if (!(method === 'wallet' || method.startsWith('wallet'))) {
          dashGw = Number(r.amount) || 0;
        }
      }

      if (dashGw > 0 && !isRazorpay(r)) {
        others.push({
          type: 'Renewal',
          amount: dashGw,
          method: r.paymentMethod,
          paidAt: r.paidAt,
          txn: r.paymentId || r.renewalTxnId,
          product: order.productName,
          userEmail: order.userEmail || order.email,
          orderId: String(order._id),
          paymentDetails: r.paymentDetails,
        });
      }
    }

    // standalone VPS today
    if (order.parentTxnId || order.checkoutSessionId) continue;
    const confirmedAt = order.paymentDetails?.confirmedAt || order.createdAt;
    if (!inRange(confirmedAt)) continue;
    if (isRazorpay(order)) continue;

    const price = Number(order.price) || 0;
    const method = String(order.paymentMethod || '').toLowerCase();
    let walletAmt =
      Number(order.paymentDetails?.walletAmount) ||
      (order.walletDeduction?.deducted ? Number(order.walletDeduction.amount) : 0) ||
      0;
    let gatewayAmt = Number(order.paymentDetails?.gatewayAmount) || 0;
    const mixedMatch = method.match(/^wallet\+(.+)$/);
    if (!mixedMatch && method !== 'wallet' && !order.paymentDetails?.walletOnly) {
      if (walletAmt > 0 && gatewayAmt > 0) {
        // mixed
      } else if (gatewayAmt || price) {
        if (!isRazorpay(order)) {
          others.push({
            type: 'New VPS',
            amount: gatewayAmt || price,
            method: order.paymentMethod,
            paidAt: confirmedAt,
            txn: order.transactionId || order.clientTxnId,
            product: order.productName,
            userEmail: order.userEmail || order.email,
            orderId: String(order._id),
            paymentDetails: order.paymentDetails,
          });
        }
      }
    } else if (mixedMatch && walletAmt === 0 && gatewayAmt === 0) {
      // wallet+wallet with no amounts stored — should be wallet only
    } else if (mixedMatch || walletAmt > 0) {
      if (!gatewayAmt && walletAmt > 0) gatewayAmt = Math.max(0, price - walletAmt);
      if (gatewayAmt > 0) {
        others.push({
          type: 'New VPS',
          amount: gatewayAmt,
          method: order.paymentMethod,
          paidAt: confirmedAt,
          txn: order.transactionId || order.clientTxnId,
          product: order.productName,
          userEmail: order.userEmail || order.email,
          orderId: String(order._id),
          paymentDetails: order.paymentDetails,
        });
      }
    }
  }

  const total = others.reduce((s, o) => s + o.amount, 0);
  console.log('Date:', todayKey);
  console.log(`"Cashfree/UPI" (Other) on dashboard: ${others.length} · ₹${total}`);
  console.log('(Yeh Cashfree/UPI NAHI — wallet se pay hue renewals/VPS galat count)\n');

  others.forEach((o, i) => {
    console.log(`${i + 1}. ${o.type} · ₹${o.amount}`);
    console.log(`   Product: ${o.product}`);
    console.log(`   Time: ${fmtTime(o.paidAt)} IST`);
    console.log(`   paymentMethod: ${o.method}`);
    console.log(`   Txn: ${o.txn}`);
    console.log(`   paymentDetails: ${JSON.stringify(o.paymentDetails || {})}`);
    console.log('');
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
