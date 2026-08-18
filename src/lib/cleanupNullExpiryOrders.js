const Order = require('@/models/orderModel').default;
const SlotIPPackage = require('@/models/slotIpPackageModel');
const IPStock = require('@/models/ipStockModel');

const DEFAULT_STALE_DAYS = 30;

function buildNullExpiryStaleQuery(olderThanDays = DEFAULT_STALE_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(olderThanDays) || DEFAULT_STALE_DAYS));

  return {
    $and: [
      { $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }] },
      { createdAt: { $lt: cutoff } },
      { provider: { $ne: 'slotip' } },
      {
        $or: [
          { slotIpPackageId: null },
          { slotIpPackageId: '' },
          { slotIpPackageId: { $exists: false } },
        ],
      },
    ],
  };
}

function buildStaleSlotIpQuery(olderThanDays = DEFAULT_STALE_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(olderThanDays) || DEFAULT_STALE_DAYS));

  return {
    createdAt: { $lt: cutoff },
    $or: [
      { provider: 'slotip' },
      { slotIpPackageId: { $exists: true, $nin: [null, ''] } },
    ],
  };
}

async function releaseOrderHeldResources(order) {
  const released = { slotIp: false, inventory: false };

  // Slot IPs must never return to the sell pool — credentials rotate upstream after sale.
  if (order?.slotIpPackageId && order?.slotIpId) {
    released.slotIp = false;
  }

  if (order?.ipStockId && order?.inventoryItemId) {
    const stock = await IPStock.findById(order.ipStockId);
    if (stock) {
      const item = stock.inventoryItems.id(order.inventoryItemId);
      if (item && item.allocated && String(item.orderId || '') === String(order._id)) {
        item.allocated = false;
        item.orderId = null;
        item.allocatedAt = null;
        stock.markModified('inventoryItems');
        await stock.save();
        released.inventory = true;
      }
    }
  }

  return released;
}

/**
 * Delete orders with no expiryDate that are older than N days since purchase (createdAt).
 */
async function deleteStaleNullExpiryOrders({ olderThanDays = DEFAULT_STALE_DAYS, dryRun = false } = {}) {
  const query = buildNullExpiryStaleQuery(olderThanDays);
  const staleOrders = await Order.find(query).select(
    '_id productName status ipAddress createdAt expiryDate slotIpPackageId slotIpId inventoryItemId ipStockId user'
  );

  if (dryRun || staleOrders.length === 0) {
    return {
      deletedCount: 0,
      matchedCount: staleOrders.length,
      dryRun: !!dryRun,
      orders: staleOrders.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        status: o.status,
        ipAddress: o.ipAddress || null,
        createdAt: o.createdAt,
        daysOld: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      })),
    };
  }

  const deleted = [];
  for (const order of staleOrders) {
    try {
      await releaseOrderHeldResources(order);
    } catch (err) {
      console.warn(`[CLEANUP-NULL-EXPIRY] Resource release failed for ${order._id}:`, err.message);
    }
    await Order.findByIdAndDelete(order._id);
    deleted.push({
      id: String(order._id),
      productName: order.productName,
      status: order.status,
      ipAddress: order.ipAddress || null,
      createdAt: order.createdAt,
    });
  }

  return {
    deletedCount: deleted.length,
    matchedCount: staleOrders.length,
    dryRun: false,
    orders: deleted,
  };
}

/**
 * Delete old Slot IP orders (no expiry field — use createdAt + N days).
 * Does NOT release proxy rows — once sold, credentials rotate upstream and IP must not be resold.
 */
async function deleteStaleSlotIpOrders({ olderThanDays = DEFAULT_STALE_DAYS, dryRun = false } = {}) {
  const query = buildStaleSlotIpQuery(olderThanDays);
  const staleOrders = await Order.find(query).select(
    '_id productName status ipAddress createdAt slotIpPackageId slotIpId user customerEmail'
  );

  if (dryRun || staleOrders.length === 0) {
    return {
      deletedCount: 0,
      matchedCount: staleOrders.length,
      dryRun: !!dryRun,
      orders: staleOrders.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        status: o.status,
        ipAddress: o.ipAddress || null,
        createdAt: o.createdAt,
        daysOld: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      })),
    };
  }

  const deleted = [];

  for (const order of staleOrders) {
    await Order.findByIdAndDelete(order._id);
    deleted.push({
      id: String(order._id),
      productName: order.productName,
      status: order.status,
      ipAddress: order.ipAddress || null,
      createdAt: order.createdAt,
    });
  }

  return {
    deletedCount: deleted.length,
    matchedCount: staleOrders.length,
    dryRun: false,
    orders: deleted,
  };
}

module.exports = {
  DEFAULT_STALE_DAYS,
  buildNullExpiryStaleQuery,
  buildStaleSlotIpQuery,
  releaseOrderHeldResources,
  deleteStaleNullExpiryOrders,
  deleteStaleSlotIpOrders,
};
