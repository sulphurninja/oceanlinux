const path = require('path');
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return originalResolve.call(this, request, parent, isMain, options);
};


const mongoose = require('mongoose');
const connectDB = require('../src/lib/db').default;
const Order = require('../src/models/orderModel').default;
const SlotIPPackage = require('../src/models/slotIpPackageModel');

const payId = process.argv[2] || 'pay_5HE5OU1kmwX4GG9P';

(async () => {
  await connectDB();
  const db = mongoose.connection.db;

  const or = [
    { transactionId: payId },
    { 'paymentDetails.payment_id': payId },
    { 'paymentDetails.paymentId': payId },
    { gatewayOrderId: payId },
    { clientTxnId: payId },
  ];

  const orders = await Order.find({ $or: or }).lean();
  console.log('\n=== ORDERS ===', orders.length);
  for (const o of orders) {
    let slotPkg = null;
    let slotIp = null;
    if (o.slotIpPackageId) {
      slotPkg = await SlotIPPackage.findById(o.slotIpPackageId).lean();
      if (slotPkg?.ips && o.slotIpId) {
        slotIp = slotPkg.ips.find((ip) => String(ip._id) === String(o.slotIpId)) || null;
      }
    }
    console.log(JSON.stringify({
      orderId: o._id,
      productName: o.productName,
      status: o.status,
      provisioningStatus: o.provisioningStatus,
      provisioningError: o.provisioningError,
      provider: o.provider,
      memory: o.memory,
      price: o.price,
      paymentMethod: o.paymentMethod,
      transactionId: o.transactionId,
      clientTxnId: o.clientTxnId,
      gatewayOrderId: o.gatewayOrderId,
      paymentDetails: o.paymentDetails,
      slotIpPackageId: o.slotIpPackageId,
      slotIpId: o.slotIpId,
      slotPackageName: slotPkg?.name || slotPkg?.title || null,
      selectedSlotIp: slotIp
        ? {
            id: slotIp._id,
            ip: slotIp.ip || slotIp.ipAddress,
            port: slotIp.port,
            username: slotIp.username,
            status: slotIp.status,
            packageId: slotIp.packageId,
          }
        : null,
      ipAddress: o.ipAddress,
      username: o.username,
      createdAt: o.createdAt,
    }, null, 2));
  }

  const renewals = await Order.find({ 'renewalPayments.paymentId': payId }).lean();
  if (renewals.length) {
    console.log('\n=== RENEWAL MATCH ===');
    for (const o of renewals) {
      const rp = o.renewalPayments.find((r) => r.paymentId === payId);
      console.log(JSON.stringify({ orderId: o._id, renewal: rp }, null, 2));
    }
  }

  for (const coll of ['checkoutsessions', 'checkoutSessions', 'carts']) {
    try {
      const docs = await db.collection(coll).find({
        $or: [
          { transactionId: payId },
          { clientTxnId: payId },
          { gatewayOrderId: payId },
          { 'paymentDetails.payment_id': payId },
          { 'items.paymentDetails.payment_id': payId },
        ],
      }).limit(5).toArray();
      if (docs.length) {
        console.log(`\n=== ${coll.toUpperCase()} ===`, docs.length);
        for (const d of docs) console.log(JSON.stringify(d, null, 2));
      }
    } catch {
      /* collection may not exist */
    }
  }

  for (const coll of ['paymentorderlogs', 'paymentOrderLogs']) {
    try {
      const logs = await db.collection(coll).find({
        $or: [
          { transactionId: payId },
          { paymentId: payId },
          { clientTxnId: payId },
          { gatewayOrderId: payId },
        ],
      }).sort({ createdAt: -1 }).limit(10).toArray();
      if (logs.length) {
        console.log(`\n=== ${coll.toUpperCase()} ===`, logs.length);
        for (const l of logs) {
          console.log(JSON.stringify({
            stage: l.stage,
            status: l.status,
            message: l.message,
            error: l.error,
            orderId: l.orderId,
            metadata: l.metadata,
            createdAt: l.createdAt,
          }, null, 2));
        }
      }
    } catch {
      /* skip */
    }
  }

  // Broad search in orders by payment id anywhere in paymentDetails
  const broad = await Order.find({
    $or: [
      { 'paymentDetails.id': payId },
      { 'paymentDetails.razorpay_payment_id': payId },
    ],
  }).lean();
  if (broad.length && !orders.length) {
    console.log('\n=== BROAD PAYMENT DETAILS MATCH ===', broad.length);
    for (const o of broad) console.log(JSON.stringify({ orderId: o._id, paymentDetails: o.paymentDetails }, null, 2));
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
