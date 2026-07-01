require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const clientTxnId = process.argv[2] || 'ORDER_1782927281785_RG3FFS';

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const order = await db.collection('orders').findOne({ clientTxnId });
  if (!order) {
    console.log('Order not found');
    process.exit(1);
  }

  const session = await db.collection('checkoutsessions').findOne({ clientTxnId });
  const paymentLogs = await db.collection('paymentorderlogs')
    .find({ clientTxnId })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  const fmt = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    return {
      utc: dt.toISOString(),
      ist: dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }),
    };
  };

  console.log(JSON.stringify({
    clientTxnId: order.clientTxnId,
    orderId: String(order._id),
    customer: order.customerName || order.user?.name,
    email: order.customerEmail,
    product: order.productName,
    amount: order.price,
    paymentMethod: order.paymentMethod,
    status: order.status,
    gatewayOrderId: order.gatewayOrderId,
    orderCreated: fmt(order.createdAt),
    orderUpdated: fmt(order.updatedAt),
    checkoutSession: session
      ? { status: session.status, createdAt: fmt(session.createdAt), paidAt: fmt(session.paidAt) }
      : null,
    paymentLogs: paymentLogs.map((l) => ({
      status: l.status,
      event: l.event,
      createdAt: fmt(l.createdAt),
      paymentId: l.paymentId,
    })),
  }, null, 2));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
