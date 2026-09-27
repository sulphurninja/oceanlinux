const Order = require('@/models/orderModel').default;
const { fulfillOrderInventory } = require('@/lib/fulfillOrderInventory');

/**
 * When new slot IPs are added to a package, assign them to paid orders
 * that are still waiting (no slotIpId yet). Oldest orders first.
 */
async function retryPendingSlotIpOrdersForPackage(packageId, { limit = 20 } = {}) {
  if (!packageId) return { retried: 0, allocated: 0, results: [] };

  const pending = await Order.find({
    slotIpPackageId: String(packageId),
    $or: [{ slotIpId: null }, { slotIpId: '' }, { slotIpId: { $exists: false } }],
    status: { $in: ['confirmed', 'active'] },
    transactionId: { $exists: true, $nin: [null, ''] },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = [];
  let allocated = 0;

  for (const order of pending) {
    if (order.provisioningStatus === 'failed') {
      order.provisioningStatus = 'pending';
      order.provisioningError = '';
      await order.save();
    }
    const result = await fulfillOrderInventory(order);
    if (result?.allocated) allocated += 1;
    results.push({
      orderId: String(order._id),
      clientTxnId: order.clientTxnId,
      allocated: !!result?.allocated,
      reason: result?.reason || null,
    });
  }

  return { retried: pending.length, allocated, results };
}

/** Paid slot orders still waiting for an IP. Oldest first. */
async function retryPendingSlotIpOrders({ limit = 25 } = {}) {
  const pending = await Order.find({
    slotIpPackageId: { $exists: true, $nin: [null, ''] },
    $or: [{ slotIpId: null }, { slotIpId: '' }, { slotIpId: { $exists: false } }],
    status: { $in: ['confirmed', 'active'] },
    transactionId: { $exists: true, $nin: [null, ''] },
    provisioningStatus: { $ne: 'active' },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = [];
  let allocated = 0;

  for (const order of pending) {
    if (order.provisioningStatus === 'failed' || order.provisioningStatus === 'provisioning') {
      order.provisioningStatus = 'pending';
      order.provisioningError = '';
      await order.save();
    }
    const result = await fulfillOrderInventory(order);
    if (result?.allocated) allocated += 1;
    results.push({
      orderId: String(order._id),
      clientTxnId: order.clientTxnId,
      allocated: !!result?.allocated,
      reason: result?.reason || result?.proofReason || null,
    });
  }

  return { retried: pending.length, allocated, results };
}

module.exports = { retryPendingSlotIpOrdersForPackage, retryPendingSlotIpOrders };
