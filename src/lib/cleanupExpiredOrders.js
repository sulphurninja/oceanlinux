const Order = require('@/models/orderModel').default;
const { releaseOrderHeldResources } = require('@/lib/orderInventoryRelease');

const EXPIRED_GRACE_DAYS = 3;

function getExpiredCutoffDate(graceDays = EXPIRED_GRACE_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(graceDays) || EXPIRED_GRACE_DAYS));
  return cutoff;
}

function buildExpiredOrdersQuery(graceDays = EXPIRED_GRACE_DAYS) {
  return {
    expiryDate: {
      $exists: true,
      $ne: null,
      $lt: getExpiredCutoffDate(graceDays),
    },
  };
}

/** Delete dashboard orders expired for graceDays+ (default 3). */
async function deleteExpiredOrders({ graceDays = EXPIRED_GRACE_DAYS, dryRun = false } = {}) {
  const expiredOrders = await Order.find(buildExpiredOrdersQuery(graceDays))
    .select(
      '_id productName expiryDate status provisioningStatus transactionId customerEmail ipAddress ipStockId inventoryItemId slotIpPackageId slotIpId'
    )
    .lean();

  if (dryRun || !expiredOrders.length) {
    return {
      deletedCount: 0,
      matchedCount: expiredOrders.length,
      orders: expiredOrders.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        expiryDate: o.expiryDate,
        transactionId: o.transactionId,
        customerEmail: o.customerEmail,
        ipAddress: o.ipAddress,
        daysExpired: Math.floor((Date.now() - new Date(o.expiryDate).getTime()) / 86400000),
      })),
    };
  }

  for (const order of expiredOrders) {
    try {
      await releaseOrderHeldResources(order);
    } catch (err) {
      console.warn(`[CLEANUP-EXPIRED] Resource release failed for ${order._id}:`, err.message);
    }
  }

  const deleteResult = await Order.deleteMany({
    _id: { $in: expiredOrders.map((o) => o._id) },
  });

  return {
    deletedCount: deleteResult.deletedCount,
    matchedCount: expiredOrders.length,
    orders: expiredOrders.map((o) => ({
      id: String(o._id),
      productName: o.productName,
      expiryDate: o.expiryDate,
      transactionId: o.transactionId,
      customerEmail: o.customerEmail,
      ipAddress: o.ipAddress,
      daysExpired: Math.floor((Date.now() - new Date(o.expiryDate).getTime()) / 86400000),
    })),
  };
}

module.exports = {
  EXPIRED_GRACE_DAYS,
  buildExpiredOrdersQuery,
  deleteExpiredOrders,
};
