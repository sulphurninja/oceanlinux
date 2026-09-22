/**
 * Release slot/trial resources when an order is removed.
 *
 * Company saved VPS (inventoryItemId) is NEVER auto-released — not on expiry,
 * order delete, refund cleanup, or cron. Owner must use "Return to pool" in company portal.
 */
async function releaseOrderHeldResources(order) {
  const released = { slotIp: false, inventory: false };

  // Slot IPs must never return to the sell pool — credentials rotate upstream after sale.
  if (order?.slotIpPackageId && order?.slotIpId) {
    released.slotIp = false;
  }

  // Saved VPS inventory: intentional no-op (manual release only).
  if (order?.ipStockId && order?.inventoryItemId) {
    return released;
  }

  return released;
}

module.exports = {
  releaseOrderHeldResources,
};
