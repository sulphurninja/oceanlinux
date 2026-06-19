const IPStock = require('@/models/ipStockModel');
const { decrementIpStockForOrder } = require('@/lib/ipStockAvailability');
const { allocateSlotIpForOrder } = require('@/lib/allocateSlotIpForOrder');
const {
  usesPreconfiguredInventory,
  allocateCompanyInventoryForOrder,
} = require('@/lib/companyInventory');

/**
 * On payment confirm: slot IP allocation, company pre-config inventory, or stockCount decrement.
 */
async function fulfillOrderInventory(order) {
  if (!order) return { skipped: true };

  if (order.slotIpPackageId && !order.slotIpId) {
    return allocateSlotIpForOrder(order);
  }

  if (!order.ipStockId || order.inventoryItemId || order.inventoryDecremented) {
    return { skipped: true, alreadyDone: !!order.inventoryDecremented };
  }

  const stock = await IPStock.findById(order.ipStockId)
    .select('company inventoryItems')
    .lean();

  if (stock && usesPreconfiguredInventory(stock)) {
    return allocateCompanyInventoryForOrder(order);
  }

  return decrementIpStockForOrder(order);
}

module.exports = { fulfillOrderInventory };
