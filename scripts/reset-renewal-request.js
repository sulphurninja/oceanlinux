/**
 * Reset a company renewal request back to pending for re-testing approve flow.
 * Usage: bun scripts/reset-renewal-request.js <orderId|ip>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: bun scripts/reset-renewal-request.js <orderId|ip>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  let order;
  if (arg.includes('.')) {
    order = await db.collection('orders').findOne({
      ipAddress: { $regex: arg.replace(/\./g, '\\.') },
    });
  } else {
    order = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(arg) });
  }

  if (!order) {
    console.error('Order not found');
    process.exit(1);
  }

  const req = await db.collection('renewalrequests')
    .find({ orderId: order._id })
    .sort({ requestedAt: -1 })
    .limit(1)
    .next();

  if (!req) {
    console.error('No renewal request for order', String(order._id));
    process.exit(1);
  }

  const previousExpiry = req.renewalSnapshot?.previousExpiry
    ? new Date(req.renewalSnapshot.previousExpiry)
    : order.expiryDate;

  await db.collection('renewalrequests').updateOne(
    { _id: req._id },
    {
      $set: {
        status: 'pending',
        'renewalSnapshot.previousExpiry': previousExpiry,
        'renewalSnapshot.proposedNewExpiry': req.renewalSnapshot?.proposedNewExpiry || previousExpiry,
      },
      $unset: { processedAt: '', adminNotes: '' },
    }
  );

  await db.collection('orders').updateOne(
    { _id: order._id },
    {
      $set: {
        expiryDate: previousExpiry,
        pendingRenewal: {
          renewalTxnId: req.renewalTxnId,
          awaitingCompanyApproval: true,
          renewalRequestId: req._id,
          paymentConfirmedAt: req.requestedAt || new Date(),
          paymentMethod: req.paymentMethod,
          gatewayOrderId: req.gatewayOrderId || req.paymentId,
        },
      },
      $unset: { lastAction: '', lastActionTime: '' },
      $pull: { renewalPayments: { renewalTxnId: req.renewalTxnId } },
    }
  );

  console.log('Reset OK — approve again from /company/Oceanlinux → Renewals');
  console.log({
    ip: order.ipAddress,
    orderId: String(order._id),
    requestId: String(req._id),
    renewalTxnId: req.renewalTxnId,
    status: 'pending',
    expiryRevertedTo: previousExpiry,
    amount: req.amount,
  });

  await mongoose.disconnect();
})();
