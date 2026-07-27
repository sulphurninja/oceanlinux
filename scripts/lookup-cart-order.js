require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const needle = process.argv[2] || 'CART_1785138669336_3IVZWY-1';

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const orders = await db
    .collection('orders')
    .find({ clientTxnId: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
    .sort({ createdAt: -1 })
    .toArray();

  if (!orders.length) {
    const byTxn = await db.collection('orders').findOne({
      $or: [
        { transactionId: needle },
        { gatewayOrderId: needle },
        { 'paymentDetails.clientTxnId': needle },
      ],
    });
    if (byTxn) orders.push(byTxn);
  }

  console.log('=== ORDERS ===', orders.length);
  for (const o of orders) {
    console.log(
      JSON.stringify(
        {
          _id: String(o._id),
          clientTxnId: o.clientTxnId,
          status: o.status,
          provisioningStatus: o.provisioningStatus,
          provisioningError: o.provisioningError,
          ipAddress: o.ipAddress,
          slotIpId: o.slotIpId,
          slotIpPackageId: o.slotIpPackageId,
          provider: o.provider,
          productName: o.productName,
          customerEmail: o.customerEmail,
          paymentMethod: o.paymentMethod,
          transactionId: o.transactionId,
          gatewayOrderId: o.gatewayOrderId,
          walletDeduction: o.walletDeduction,
          createdAt: o.createdAt,
          lastProvisionAttempt: o.lastProvisionAttempt,
        },
        null,
        2
      )
    );
  }

  const logs = await db
    .collection('paymentorderlogs')
    .find({ clientTxnId: new RegExp(needle.split('-')[0], 'i') })
    .sort({ createdAt: 1 })
    .toArray();

  console.log('\n=== PAYMENT LOGS ===', logs.length);
  for (const l of logs) {
    console.log(
      JSON.stringify(
        {
          event: l.eventType || l.type || l.action,
          message: l.message || l.errorMessage,
          success: l.success,
          anomaly: l.anomaly,
          createdAt: l.createdAt,
          details: l.details ? JSON.stringify(l.details).slice(0, 400) : undefined,
        },
        null,
        2
      )
    );
  }

  const checkout = await db.collection('checkoutsessions').findOne({
    clientTxnId: new RegExp(needle.split('-')[0], 'i'),
  });
  if (checkout) {
    console.log('\n=== CHECKOUT SESSION ===');
    console.log(JSON.stringify(checkout, null, 2).slice(0, 3000));
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
