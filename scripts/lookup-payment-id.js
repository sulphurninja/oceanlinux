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

  const logs = await db.collection('paymentorderlogs')
    .find({ paymentId })
    .sort({ createdAt: -1 })
    .toArray();

  console.log('paymentorderlogs:', logs.length);
  for (const log of logs) {
    console.log(JSON.stringify(log, null, 2));
  }

  const orders = await db.collection('orders').find({
    $or: [
      { transactionId: paymentId },
      { gatewayPaymentId: paymentId },
      { 'renewalPayments.paymentId': paymentId },
      { 'paymentDetails.paymentId': paymentId },
      { 'paymentDetails.razorpayPaymentId': paymentId },
    ],
  }).toArray();

  if (logs.length) {
    for (const log of logs) {
      if (!log.clientTxnId) continue;
      const byTxn = await db.collection('orders').findOne({ clientTxnId: log.clientTxnId });
      if (byTxn && !orders.some((o) => String(o._id) === String(byTxn._id))) {
        orders.push(byTxn);
      }
    }
  }

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
      ipStockId: order.ipStockId,
      ipStockName: stock?.name,
      ipAddress: order.ipAddress,
      kurohostInstanceId: order.kurohostInstanceId,
      transactionId: order.transactionId,
      gatewayOrderId: order.gatewayOrderId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customerEmail: order.customerEmail,
    }, null, 2));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
