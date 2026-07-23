import userWalletService from '@/services/userWalletService';
import Order from '@/models/orderModel';
import {
  probeGatewayPayment,
  confirmPendingOrderPayment,
} from '@/lib/confirmPendingOrderPayment';

/**
 * Release a pending buy-now order when payment is abandoned or fails.
 * Refunds any wallet reservation and keeps status as pending (never cancelled).
 * Idempotent — safe to call multiple times for the same order.
 */
export async function cancelPendingBuyNowOrder(order, reason = 'cancelled') {
  if (!order) return { success: false, reason: 'order not found' };

  if (order.status === 'confirmed' || order.status === 'active') {
    return { success: false, reason: 'already confirmed' };
  }

  if (order.paymentDetails?.unpaidReleased) {
    return { success: true, alreadyProcessed: true, refunded: 0 };
  }

  const legacyUnpaid = ['cancelled', 'canceled', 'failed'].includes(
    String(order.status || '').trim().toLowerCase()
  );
  if (legacyUnpaid && !order.walletDeduction?.deducted) {
    order.status = 'pending';
    order.paymentDetails = {
      ...(order.paymentDetails || {}),
      unpaidReleased: true,
      unpaidReason: reason,
      unpaidReleasedAt: new Date(),
    };
    await order.save();
    return { success: true, alreadyProcessed: true, refunded: 0 };
  }

  if (order.status !== 'pending' && !legacyUnpaid) {
    return { success: false, reason: `cannot release status ${order.status}` };
  }

  // Only refund money that was actually debited. With deduct-on-success the
  // wallet stays untouched until payment lands, so an abandoned/cancelled
  // order that never charged the wallet has nothing to return (refunding the
  // intended amount here would credit money the customer never paid).
  const walletAmount = order.walletDeduction?.deducted
    ? Number(order.walletDeduction.amount) || 0
    : 0;

  let refunded = 0;
  let refundError = null;

  if (walletAmount > 0) {
    try {
      await userWalletService.refund(order.user, walletAmount, {
        description: `Buy-now refund ${order.clientTxnId}`,
        reference: order.clientTxnId,
        metadata: {
          orderId: String(order._id),
          reason,
          originalDebitTxnId: order.walletDeduction?.transactionId,
        },
      });
      refunded = walletAmount;
    } catch (err) {
      console.error('[cancelPendingOrder] wallet refund failed:', err.message);
      refundError = err.message;
    }
  }

  if (refundError && walletAmount > 0) {
    order.paymentDetails = {
      ...(order.paymentDetails || {}),
      walletRefundError: refundError,
    };
    await order.save();
    return { success: false, reason: `Wallet refund failed: ${refundError}`, refunded: 0 };
  }

  order.status = 'pending';
  order.paymentDetails = {
    ...(order.paymentDetails || {}),
    unpaidReleased: true,
    unpaidReason: reason,
    unpaidReleasedAt: new Date(),
  };
  if (refunded > 0 && order.walletDeduction) {
    order.walletDeduction.deducted = false;
  }
  await order.save();

  return { success: true, orderId: order._id, refunded };
}

/**
 * Sweep abandoned single "Buy Now" orders that still hold a live wallet
 * reservation. Cart checkouts are handled separately via CheckoutSession
 * (see /api/cart/checkout/sweep). This closes the gap where a customer paid
 * part of an order from their wallet, was sent to the payment gateway, then
 * abandoned it (closed the tab, pressed back on the UPI page, dismissed the
 * modal without the dismiss handler firing, etc.) — leaving the wallet money
 * debited forever.
 *
 * Safety: before refunding we probe the gateway. If the customer actually
 * paid, we confirm the order instead of refunding, so we never both deliver
 * the product AND return the wallet money.
 *
 * Idempotent — orders already released (`unpaidReleased`) are skipped.
 */
export async function sweepAbandonedBuyNowOrders({ staleAfterMinutes = 30, limit = 200 } = {}) {
  const minutes = Math.max(5, Number(staleAfterMinutes) || 30);
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const orders = await Order.find({
    status: 'pending',
    createdAt: { $lt: cutoff },
    'walletDeduction.deducted': true,
    'paymentDetails.unpaidReleased': { $ne: true },
    // Cart-checkout orders are swept via their CheckoutSession, skip them here.
    $and: [
      { $or: [{ checkoutSessionId: { $exists: false } }, { checkoutSessionId: null }, { checkoutSessionId: '' }] },
      { $or: [{ parentTxnId: { $exists: false } }, { parentTxnId: null }, { parentTxnId: '' }] },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = [];
  for (const order of orders) {
    try {
      // Never refund a paid order — confirm it instead when the gateway says paid.
      const probe = await probeGatewayPayment(order);
      if (probe.success) {
        const recovery = await confirmPendingOrderPayment(order, probe, { logSource: 'sweep-buynow' });
        results.push({
          orderId: String(order._id),
          clientTxnId: order.clientTxnId,
          action: recovery.confirmed ? 'recovered' : 'recover_failed',
          refunded: 0,
        });
        continue;
      }

      const cancel = await cancelPendingBuyNowOrder(order, 'abandoned');
      results.push({
        orderId: String(order._id),
        clientTxnId: order.clientTxnId,
        action: cancel.success ? 'refunded' : 'refund_failed',
        refunded: cancel.refunded || 0,
        reason: cancel.reason,
      });
    } catch (err) {
      console.error('[sweepAbandonedBuyNowOrders] failed for order', String(order._id), err.message);
      results.push({
        orderId: String(order._id),
        clientTxnId: order.clientTxnId,
        action: 'error',
        error: err.message,
      });
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    staleAfterMinutes: minutes,
    swept: results.length,
    results,
  };
}

/**
 * Release a pending renewal when gateway payment is abandoned or fails.
 * Refunds any wallet amount debited at /api/payment/renew initiate.
 * Idempotent — safe to call multiple times for the same renewalTxnId.
 */
export async function cancelPendingRenewal(order, reason = 'cancelled') {
  if (!order) return { success: false, reason: 'order not found' };

  const pending = order.pendingRenewal?.toObject?.() || order.pendingRenewal;
  if (!pending?.renewalTxnId) {
    return { success: true, alreadyProcessed: true, refunded: 0, reason: 'no pending renewal' };
  }

  const alreadyRenewed = (order.renewalPayments || []).some(
    (rp) => rp.renewalTxnId === pending.renewalTxnId
  );
  if (alreadyRenewed || pending.awaitingCompanyApproval) {
    return { success: false, reason: 'renewal already confirmed' };
  }

  const walletAmount = Number(pending.walletAmount) || 0;
  const walletTxnId = String(pending.walletTxnId || '').trim();
  // Only refund when wallet was actually debited (txn id proves it).
  const walletWasDebited = pending.walletDeducted === true && !!walletTxnId;
  let refunded = 0;

  if (walletAmount > 0 && walletWasDebited) {
    try {
      await userWalletService.refund(order.user, walletAmount, {
        description: `Renewal refund ${pending.renewalTxnId}`,
        reference: `${pending.renewalTxnId}_refund`,
        metadata: {
          orderId: String(order._id),
          reason,
          originalDebitTxnId: walletTxnId,
        },
      });
      refunded = walletAmount;
      console.log(`[cancelPendingRenewal] Refunded ₹${refunded} for ${pending.renewalTxnId}`);
    } catch (err) {
      console.error('[cancelPendingRenewal] wallet refund failed:', err.message);
      return { success: false, reason: err.message, refunded: 0 };
    }
  } else if (walletAmount > 0) {
    console.log(`[cancelPendingRenewal] Cleared pending wallet ₹${walletAmount} (never debited) for ${pending.renewalTxnId}`);
  }

  await Order.findByIdAndUpdate(order._id, { $unset: { pendingRenewal: 1 } });

  return {
    success: true,
    orderId: order._id,
    refunded,
    renewalTxnId: pending.renewalTxnId,
  };
}
