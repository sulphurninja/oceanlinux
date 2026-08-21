import Order from '@/models/orderModel';
import userWalletService from '@/services/userWalletService';

/**
 * Debits the wallet portion of a pending renewal after gateway payment
 * is verified. Skips if already debited (wallet-only renewals debit at init).
 */
export async function debitPendingRenewalWallet(order, renewalTxnId) {
  const pending = order.pendingRenewal?.toObject?.() || order.pendingRenewal;
  if (!pending || pending.walletDeducted) return;

  const walletAmount = Number(pending.walletAmount) || 0;
  if (walletAmount <= 0) return;

  const debit = await userWalletService.debit(order.user, walletAmount, {
    description: `Renewal ${order.productName} - ${order.memory}`,
    reference: renewalTxnId,
    metadata: {
      orderId: String(order._id),
      renewalTxnId,
      totalPrice: pending.amount,
      gatewayAmount: pending.gatewayAmount,
      debitedOnConfirm: true,
    },
  });

  await Order.findByIdAndUpdate(order._id, {
    'pendingRenewal.walletDeducted': true,
    'pendingRenewal.walletTxnId': debit.walletTxnId,
    'pendingRenewal.walletPending': false,
  });

  order.pendingRenewal.walletDeducted = true;
  order.pendingRenewal.walletTxnId = debit.walletTxnId;
  order.pendingRenewal.walletPending = false;
}
