const IPStock = require('@/models/ipStockModel');
const { decrementIpStockForOrder } = require('@/lib/ipStockAvailability');
const { allocateSlotIpForOrder } = require('@/lib/allocateSlotIpForOrder');
const {
  usesCompanyInventoryFulfillment,
  allocateCompanyInventoryForOrder,
} = require('@/lib/companyInventory');
const { orderHasConfirmedPayment } = require('@/lib/orderPaymentStatus');

/**
 * On payment confirm: slot IP allocation, company pre-config inventory, or stockCount decrement.
 *
 * PAYMENT GUARD: like provisionServer(), this delivery path (Slot IP + company
 * pre-configured inventory + stock decrement, for ANY company) refuses to fulfil
 * an order that has no confirmed payment. Pass { allowUnpaid: true } only for an
 * admin-forced complimentary order.
 */
async function fulfillOrderInventory(order, options = {}) {
  if (!order) return { skipped: true };

  const allowUnpaid = options && options.allowUnpaid === true;
  if (!allowUnpaid && !orderHasConfirmedPayment(order)) {
    console.warn(
      `[FULFILL-INVENTORY] ⛔ Blocked: order ${order._id || order.clientTxnId || '(unknown)'} has no confirmed payment — inventory NOT allocated`
    );
    try {
      const PaymentOrderLogger = require('@/services/paymentOrderLogger');
      const logger = PaymentOrderLogger.forOrder(order, 'inventory-guard');
      logger.warning('Inventory fulfilment blocked: order has no confirmed payment', {
        orderId: String(order._id || ''),
        status: order.status,
        transactionId: order.transactionId || null,
        walletDeducted: order.walletDeduction?.deducted === true,
      });
      await logger.save({
        success: false,
        anomaly: true,
        errorMessage: 'inventory_blocked_unpaid_order',
      });
    } catch (logErr) {
      console.error('[FULFILL-INVENTORY] Failed to log payment-guard block:', logErr.message);
    }
    return { skipped: true, paymentRequired: true, blocked: true };
  }

  if (order.slotIpPackageId && !order.slotIpId) {
    return allocateSlotIpForOrder(order);
  }

  if (!order.ipStockId || order.inventoryItemId || order.inventoryDecremented) {
    return { skipped: true, alreadyDone: !!order.inventoryDecremented };
  }

  const stock = await IPStock.findById(order.ipStockId)
    .select('company inventoryItems')
    .lean();

  if (stock && usesCompanyInventoryFulfillment(stock)) {
    return allocateCompanyInventoryForOrder(order);
  }

  return decrementIpStockForOrder(order);
}

module.exports = { fulfillOrderInventory };
