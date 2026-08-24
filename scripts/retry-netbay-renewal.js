/**
 * Retry Netbay upstream renewal for an order that already paid (no new charge).
 * Usage: node scripts/retry-netbay-renewal.js <orderId|renewalTxnId>
 */
const path = require('path');
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const connectDB = require('../src/lib/db').default;
const Order = require('../src/models/orderModel').default;
const RenewalLog = require('../src/models/renewalLogModel').default;
const { executeNetbayUpstreamRenewal } = require('../src/lib/netbayRenewal');
const { syncNetbayOrderFromApi } = require('../src/lib/netbayOrderSync');

const mongoose = require('mongoose');

const ref = process.argv[2] || 'RENEWAL_1787489578931_1X07O8';

function buildOrderQuery(refId) {
  const or = [{ gatewayOrderId: refId }, { 'renewalPayments.renewalTxnId': refId }];
  if (mongoose.Types.ObjectId.isValid(refId) && String(new mongoose.Types.ObjectId(refId)) === refId) {
    or.unshift({ _id: refId });
  }
  return { $or: or };
}

(async () => {
  await connectDB();

  const order = await Order.findOne(buildOrderQuery(ref));

  if (!order) {
    console.error('Order not found for:', ref);
    process.exit(1);
  }

  console.log('Order:', order._id.toString());
  console.log('IP:', order.ipAddress);
  console.log('Product:', order.productName);
  console.log('Current expiry:', order.expiryDate);
  console.log('Netbay serviceId:', order.netbayServiceId);

  const paidRenewal =
    (order.renewalPayments || []).find((rp) => rp.renewalTxnId === ref) ||
    (order.renewalPayments || []).slice(-1)[0];

  if (!paidRenewal) {
    console.error('No renewal payment record — aborting.');
    process.exit(1);
  }

  if (paidRenewal.providerRenewalSuccess === true) {
    console.log('Already renewed upstream:', paidRenewal.renewalTxnId);
    process.exit(0);
  }

  console.log('Retrying Netbay renew for txn:', paidRenewal.renewalTxnId);

  const result = await executeNetbayUpstreamRenewal(order, { months: 1 });
  if (!result.success) {
    console.error('\n❌ Netbay renew failed:', result.error);
    if (result.result) console.error(JSON.stringify(result.result, null, 2));
    process.exit(2);
  }

  let newExpiry = result.newExpiryDate;
  const sync = await syncNetbayOrderFromApi(order);
  if (sync.ok && sync.expiryDate) newExpiry = sync.expiryDate;

  console.log('Netbay renew OK');
  console.log('New expiry:', newExpiry?.toISOString?.() || paidRenewal.newExpiry);

  if (!newExpiry && paidRenewal.newExpiry) newExpiry = new Date(paidRenewal.newExpiry);
  if (newExpiry) order.expiryDate = newExpiry;
  if (sync.ok && sync.dbUpdates) Object.assign(order, sync.dbUpdates);

  const rpIdx = order.renewalPayments.findIndex(
    (rp) => String(rp.renewalTxnId) === String(paidRenewal.renewalTxnId),
  );
  if (rpIdx >= 0) {
    order.renewalPayments[rpIdx].providerRenewalSuccess = true;
    order.renewalPayments[rpIdx].providerRenewalResult = result.result || { success: true };
    if (newExpiry) order.renewalPayments[rpIdx].newExpiry = newExpiry;
  }

  order.markModified('renewalPayments');
  await order.save();

  const log = await RenewalLog.findOne({ renewalTxnId: paidRenewal.renewalTxnId });
  if (log) {
    log.providerApiResult = {
      provider: 'netbay',
      apiCalled: true,
      success: true,
      result: result.result,
      error: null,
    };
    log.success = true;
    log.newExpiryDate = order.expiryDate;
    log.logs.push({
      timestamp: new Date(),
      level: 'success',
      message: 'Admin retry: Netbay upstream renewal succeeded',
      data: { newExpiryDate: order.expiryDate },
    });
    await log.save();
  }

  console.log('\n✅ Done — order expiry now:', order.expiryDate);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
