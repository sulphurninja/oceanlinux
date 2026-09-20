const IPStock = require('@/models/ipStockModel');

/**
 * Free company inventory rows (and similar held resources) when an order is removed.
 */
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

module.exports = {
  releaseOrderHeldResources,
};
