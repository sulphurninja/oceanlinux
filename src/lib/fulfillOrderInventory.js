const IPStock = require('@/models/ipStockModel');
const { decrementIpStockForOrder } = require('@/lib/ipStockAvailability');
const { allocateSlotIpForOrder } = require('@/lib/allocateSlotIpForOrder');
const { allocateTrialVpsForOrder } = require('@/lib/allocateTrialVpsForOrder');
const {
  shouldAssignCompanyInventoryForOrder,
  allocateCompanyInventoryForOrder,
} = require('@/lib/companyInventory');
const { orderHasConfirmedPayment, verifyOrderPaymentProof } = require('@/lib/orderPaymentStatus');
const Order = require('@/models/orderModel').default;

/** True when the run actually consumed an IP or a stock unit. */
function consumedSomething(result) {
  return result?.allocated === true || result?.remaining !== undefined;
}

/**
 * Take the fulfilment claim for this order, atomically. Returns false when
 * another handler already holds it, in which case we must not allocate.
 *
 * The individual allocators are each atomic on their own collection, but their
 * "already done?" guards read the in-memory order. Two handlers that loaded the
 * order separately (duplicate webhook, or webhook + confirm) both saw an
 * unfulfilled order and each allocated a different IP for one payment.
 */
async function claimFulfilment(orderId) {
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, inventoryFulfilmentClaimedAt: null },
    { $set: { inventoryFulfilmentClaimedAt: new Date() } },
    { new: true }
  );
  return !!claimed;
}

async function releaseFulfilment(orderId) {
  try {
    await Order.updateOne({ _id: orderId }, { $set: { inventoryFulfilmentClaimedAt: null } });
  } catch (err) {
    console.error('[FULFILL-INVENTORY] Failed to release fulfilment claim:', err.message);
  }
}

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
  if (!allowUnpaid) {
    const proof = await verifyOrderPaymentProof(order);
    if (!proof.ok) {
      console.warn(
        `[FULFILL-INVENTORY] ⛔ Blocked: order ${order._id || order.clientTxnId || '(unknown)'} proof=${proof.reason} — inventory NOT allocated`
      );
      try {
        const PaymentOrderLogger = require('@/services/paymentOrderLogger');
        const logger = PaymentOrderLogger.forOrder(order, 'inventory-guard');
        logger.warning('Inventory fulfilment blocked: no verifiable payment proof', {
          orderId: String(order._id || ''),
          status: order.status,
          transactionId: order.transactionId || null,
          walletDeducted: order.walletDeduction?.deducted === true,
          proofReason: proof.reason,
        });
        await logger.save({
          success: false,
          anomaly: true,
          errorMessage: `inventory_blocked_${proof.reason || 'unpaid_order'}`,
        });
      } catch (logErr) {
        console.error('[FULFILL-INVENTORY] Failed to log payment-guard block:', logErr.message);
      }
      return { skipped: true, paymentRequired: true, blocked: true, proofReason: proof.reason };
    }
  } else if (!orderHasConfirmedPayment(order)) {
    console.warn(
      `[FULFILL-INVENTORY] ⚠️ allowUnpaid=true — fulfilling complimentary order without payment proof`
    );
  }

  const wantsSlotIp = !!order.slotIpPackageId && !order.slotIpId;
  const wantsTrialVps = !!order.trialVpsPackageId && !order.trialVpsSlotId;
  const wantsStock =
    !order.slotIpPackageId &&
    !order.trialVpsPackageId &&
    !!order.ipStockId &&
    !order.inventoryItemId &&
    !order.inventoryDecremented;

  // Cheap in-memory check first, so an obviously-finished order costs no write.
  if (!wantsSlotIp && !wantsTrialVps && !wantsStock) {
    if (order.slotIpPackageId || order.trialVpsPackageId) return { allocated: false, skipped: true };
    return { skipped: true, alreadyDone: !!order.inventoryDecremented };
  }

  if (!(await claimFulfilment(order._id))) {
    return { skipped: true, alreadyDone: true, concurrent: true };
  }

  let result;
  try {
    result = await runFulfilment(order, { wantsSlotIp, wantsTrialVps });
  } catch (err) {
    await releaseFulfilment(order._id);
    throw err;
  }

  // Nothing was consumed (sold out, mismatch, nothing to do) — hand the claim
  // back so a later legitimate retry can still fulfil this order.
  if (!consumedSomething(result)) {
    await releaseFulfilment(order._id);
  }

  return result;
}

async function runFulfilment(order, { wantsSlotIp, wantsTrialVps }) {
  if (wantsTrialVps) {
    return allocateTrialVpsForOrder(order);
  }
  if (wantsSlotIp) {
    return allocateSlotIpForOrder(order);
  }

  const stock = await IPStock.findById(order.ipStockId)
    .select('company inventoryItems defaultConfigurations tags')
    .lean();

  let company = null;
  if (stock?.company) {
    const Company = require('@/models/companyModel').default;
    company = await Company.findById(stock.company)
      .select('resellerApi netbayApi')
      .lean();
  }

  if (stock && shouldAssignCompanyInventoryForOrder(stock, company)) {
    const result = await allocateCompanyInventoryForOrder(order);
    if (result.allocated || !result.fallbackToApi) return result;
    // Saved VPS exhausted — fall through to panel API auto-buy when zone is live.
  }

  return decrementIpStockForOrder(order);
}

module.exports = { fulfillOrderInventory };
