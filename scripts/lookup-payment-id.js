require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const paymentId = process.argv[2];
if (!paymentId) {
  console.error('Usage: bun scripts/lookup-payment-id.js <paymentId>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;
  const re = new RegExp(paymentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const orders = await db.collection('orders').find({
    $or: [
      { transactionId: re },
      { gatewayPaymentId: re },
      { 'paymentDetails.razorpayPaymentId': re },
      { 'paymentDetails.paymentId': re },
      { 'paymentDetails.razorpay_payment_id': re },
      { 'renewalPayments.paymentId': re },
      { 'renewalPayments.transactionId': re },
    ],
  }).toArray();

  console.log('orders found:', orders.length);
  for (const order of orders) {
    const stock = order.ipStockId
      ? await db.collection('ipstocks').findOne({ _id: new mongoose.Types.ObjectId(String(order.ipStockId)) })
      : null;
    console.log(JSON.stringify({
      orderId: String(order._id),
      clientTxnId: order.clientTxnId,
      productName: order.productName,
      memory: order.memory,
      price: order.price,
      paymentMethod: order.paymentMethod,
      status: order.status,
      provisioningStatus: order.provisioningStatus,
      provisioningError: order.provisioningError,
      provider: order.provider,
      ipAddress: order.ipAddress,
      ipStockId: order.ipStockId,
      ipStockName: stock?.name,
      company: stock?.company ? String(stock.company) : null,
      transactionId: order.transactionId,
      gatewayOrderId: order.gatewayOrderId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      resellerOrderId: order.resellerOrderId,
      hostycareServiceId: order.hostycareServiceId,
      smartvpsServiceId: order.smartvpsServiceId,
      advpsServiceId: order.advpsServiceId,
      netbayServiceId: order.netbayServiceId,
      kurohostInstanceId: order.kurohostInstanceId,
      pendingPayment: order.pendingPayment,
      paymentDetails: order.paymentDetails,
    }, null, 2));
  }

  const recharges = await db.collection('walletrecharges').find({
    $or: [{ transactionId: re }, { gatewayOrderId: re }],
  }).toArray();
  console.log('wallet recharges:', recharges.length);
  for (const r of recharges) {
    console.log(JSON.stringify(r, null, 2));
  }

  const logs = await db.collection('paymentorderlogs').find({ paymentId: re }).toArray();
  console.log('paymentorderlogs:', logs.length);
  for (const log of logs) {
    console.log(JSON.stringify(log, null, 2));
  }

  // Also search by partial payment id in any string field via clientTxnId from razorpay notes
  const pending = await db.collection('orders').find({
    status: { $in: ['pending', 'confirmed', 'active'] },
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    $or: [
      { ipAddress: { $in: [null, ''] } },
      { ipAddress: { $exists: false } },
    ],
    provisioningStatus: { $in: ['pending', 'processing', 'failed', 'error', null] },
  }).sort({ createdAt: -1 }).limit(30).toArray();

  console.log('\nRecent orders without IP (last 7 days):', pending.length);
  for (const o of pending.slice(0, 10)) {
    console.log(JSON.stringify({
      orderId: String(o._id),
      txn: o.transactionId,
      clientTxn: o.clientTxnId,
      email: o.customerEmail,
      product: o.productName,
      status: o.status,
      prov: o.provisioningStatus,
      error: o.provisioningError,
      created: o.createdAt,
    }));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
