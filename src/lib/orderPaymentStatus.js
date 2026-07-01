/**
 * Shared payment guard used by every order-delivery path (VPS provisioning via
 * provisionServer AND inventory fulfillment for Slot IP / company pre-configured
 * stock via fulfillOrderInventory).
 *
 * This is the single source of truth for "is this order actually paid?" so that
 * no delivery path — for any provider or product type — can ever hand over a
 * server/IP without a confirmed payment.
 *
 * An order is considered PAID when ANY of the following is true:
 *  - it has a non-empty gateway transactionId (Razorpay/Cashfree/UPI captured,
 *    or wallet-only orders which store a WALLET_* transactionId), OR
 *  - the wallet was fully deducted for it (walletDeduction.deducted === true), OR
 *  - an admin explicitly flagged it as a complimentary / manually-settled order
 *    (paymentDetails.manualOverride === true).
 *
 * NOTE: order.status alone ('confirmed'/'active') is intentionally NOT treated as
 * proof of payment — the original bug was that status could be flipped without a
 * real payment. We require concrete payment evidence instead.
 */
function orderHasConfirmedPayment(order) {
  if (!order) return false;

  const txn = order.transactionId;
  if (typeof txn === 'string' && txn.trim() !== '') return true;

  if (order.walletDeduction && order.walletDeduction.deducted === true) return true;

  if (order.paymentDetails && order.paymentDetails.manualOverride === true) return true;

  return false;
}

module.exports = { orderHasConfirmedPayment };
