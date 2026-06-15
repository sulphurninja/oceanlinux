import userWalletService from '@/services/userWalletService';

/**
 * Cancel a pending buy-now order and refund any wallet reservation.
 * Idempotent — safe to call multiple times for the same order.
 */
export async function cancelPendingBuyNowOrder(order, reason = 'cancelled') {
  if (!order) return { success: false, reason: 'order not found' };

  if (order.status === 'confirmed' || order.status === 'active') {
    return { success: false, reason: 'already confirmed' };
  }

  if (order.status === 'cancelled' || order.status === 'failed') {
    return { success: true, alreadyProcessed: true, refunded: 0 };
  }

  if (order.status !== 'pending') {
    return { success: false, reason: `cannot cancel status ${order.status}` };
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

  order.status = reason === 'cancelled' ? 'cancelled' : 'failed';
  await order.save();

  return { success: true, orderId: order._id, refunded };
}
