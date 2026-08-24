const connectDB = require('../src/lib/db').default;
const Order = require('../src/models/orderModel').default;
const RenewalRequest = require('../src/models/renewalRequestModel').default;
const RenewalLog = require('../src/models/renewalLogModel').default;
const PaymentOrderLog = require('../src/models/paymentOrderLogModel').default;

const txn = process.argv[2] || 'RENEWAL_1787489578931_1X07O8';

(async () => {
  await connectDB();
  console.log('Looking up:', txn);

  const orders = await Order.find({
    $or: [
      { clientTxnId: txn },
      { gatewayOrderId: txn },
      { transactionId: txn },
      { 'paymentDetails.renewalTxnId': txn },
      { 'paymentDetails.renewals': { $elemMatch: { renewalTxnId: txn } } },
    ],
  }).lean();

  console.log('\n=== ORDERS ===', orders.length);
  for (const o of orders) {
    console.log(JSON.stringify({
      id: o._id,
      productName: o.productName,
      status: o.status,
      ip: o.ipAddress,
      expiryDate: o.expiryDate,
      provider: o.provider,
      clientTxnId: o.clientTxnId,
      gatewayOrderId: o.gatewayOrderId,
      paymentMethod: o.paymentMethod,
      paymentDetails: o.paymentDetails,
      renewalError: o.renewalError,
    }, null, 2));
  }

  const reqs = await RenewalRequest.find({
    $or: [{ renewalTxnId: txn }, { 'paymentDetails.renewalTxnId': txn }],
  }).lean();
  console.log('\n=== RENEWAL REQUESTS ===', reqs.length);
  for (const r of reqs) {
    console.log(JSON.stringify(r, null, 2));
  }

  const logs = await RenewalLog.find({
    $or: [{ renewalTxnId: txn }, { clientTxnId: txn }, { gatewayOrderId: txn }],
  }).sort({ createdAt: -1 }).limit(10).lean();
  console.log('\n=== RENEWAL LOGS ===', logs.length);
  for (const l of logs) {
    console.log(JSON.stringify(l, null, 2));
  }

  const payLogs = await PaymentOrderLog.find({
    $or: [
      { clientTxnId: txn },
      { gatewayOrderId: txn },
      { transactionId: txn },
      { renewalTxnId: txn },
    ],
  }).sort({ createdAt: -1 }).limit(10).lean();
  console.log('\n=== PAYMENT ORDER LOGS ===', payLogs.length);
  for (const p of payLogs) {
    console.log(JSON.stringify({
      status: p.status,
      stage: p.stage,
      message: p.message,
      error: p.error,
      gateway: p.gateway,
      orderId: p.orderId,
      createdAt: p.createdAt,
      providerApiResult: p.providerApiResult,
      metadata: p.metadata,
    }, null, 2));
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
