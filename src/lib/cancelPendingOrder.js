import userWalletService from '@/services/userWalletService';

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
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        walletRefundError: err.message,
      };
    }
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
