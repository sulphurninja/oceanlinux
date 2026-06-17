import userWalletService from '@/services/userWalletService';
import Order from '@/models/orderModel';

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

  const walletAmount =
    order.walletDeduction?.deducted
      ? Number(order.walletDeduction.amount) || 0
      : Number(order.paymentDetails?.walletAmount) || 0;

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
