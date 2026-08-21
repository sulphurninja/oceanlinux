require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const orderId = process.argv[2] || '6a454fb2f5ef9ed6008366b5';
const clientTxnId = process.argv[3] || 'ORDER_1782927281785_RG3FFS';

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;
  const oid = new mongoose.Types.ObjectId(orderId);

  const order = await db.collection('orders').findOne({ _id: oid });
  if (!order) {
    console.log('Order not found');
    process.exit(1);
  }

  const userId = order.user;
  const windowStart = new Date(new Date(order.createdAt).getTime() - 60000);
  const windowEnd = new Date(new Date(order.createdAt).getTime() + 300000);

  const notifications = await db.collection('notifications')
    .find({
      userId: userId,
      createdAt: { $gte: windowStart, $lte: windowEnd },
    })
    .sort({ createdAt: 1 })
    .toArray();

  const paymentLogs = await db.collection('paymentorderlogs')
    .find({
      $or: [
        { clientTxnId },
        { orderId: String(orderId) },
        { orderId: oid },
      ],
    })
    .sort({ createdAt: 1 })
    .toArray();

  const walletTxns = await db.collection('wallettransactions')
    .find({
      user: userId,
      createdAt: { $gte: windowStart, $lte: windowEnd },
    })
    .sort({ createdAt: 1 })
    .toArray();

  const nearbyOrders = await db.collection('orders')
    .find({
      user: userId,
      createdAt: { $gte: windowStart, $lte: windowEnd },
    })
    .sort({ createdAt: 1 })
    .toArray();

  const fmt = (d) => (d ? new Date(d).toISOString() : null);

  console.log('=== ORDER TIMELINE ===');
  console.log(JSON.stringify({
    createdAt: fmt(order.createdAt),
    lastProvisionAttempt: fmt(order.lastProvisionAttempt),
    updatedAt: fmt(order.updatedAt),
    msToProvision: order.lastProvisionAttempt
      ? new Date(order.lastProvisionAttempt) - new Date(order.createdAt)
      : null,
  }, null, 2));

  console.log('\n=== ORDER PAYMENT STATE ===');
  console.log(JSON.stringify({
    status: order.status,
    transactionId: order.transactionId,
    gatewayOrderId: order.gatewayOrderId,
    paymentMethod: order.paymentMethod,
    paymentDetails: order.paymentDetails,
    walletDeduction: order.walletDeduction,
    provisioningStatus: order.provisioningStatus,
    autoProvisioned: order.autoProvisioned,
    provider: order.provider,
    netbayServiceId: order.netbayServiceId,
    ipAddress: order.ipAddress,
    panelUsername: order.panelUsername,
    provisioningLockId: order.provisioningLockId,
  }, null, 2));

  console.log('\n=== NOTIFICATIONS IN WINDOW (' + notifications.length + ') ===');
  for (const n of notifications) {
    console.log(JSON.stringify({
      type: n.type,
      title: n.title,
      message: (n.message || '').slice(0, 200),
      createdAt: fmt(n.createdAt),
      data: n.data,
    }));
  }

  console.log('\n=== PAYMENT LOGS (' + paymentLogs.length + ') ===');
  for (const l of paymentLogs) {
    console.log(JSON.stringify(l, null, 2));
  }

  console.log('\n=== WALLET TXNS IN WINDOW (' + walletTxns.length + ') ===');
  for (const w of walletTxns) {
    console.log(JSON.stringify({
      type: w.type,
      amount: w.amount,
      description: w.description,
      reference: w.reference,
      createdAt: fmt(w.createdAt),
    }));
  }

  console.log('\n=== NEARBY ORDERS (' + nearbyOrders.length + ') ===');
  for (const o of nearbyOrders) {
    console.log(JSON.stringify({
      _id: String(o._id),
      clientTxnId: o.clientTxnId,
      status: o.status,
      transactionId: o.transactionId,
      paymentMethod: o.paymentMethod,
      createdAt: fmt(o.createdAt),
      lastProvisionAttempt: fmt(o.lastProvisionAttempt),
      ipAddress: o.ipAddress,
    }));
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
