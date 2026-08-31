export const UPI_PROVIDER_VYAPAR = 'vyapar';

/**
 * Vyapar only marks an order paid when the credited amount matches their order
 * amount to the paise. When verified:true, trust the gateway — our DB
 * gatewayAmount can be stale (base price without unique-paise surcharge).
 */
export function vyaparPaymentVerified(verification) {
  return verification?.provider === UPI_PROVIDER_VYAPAR && verification?.verified === true;
}

/**
 * Whether a verified UPI lookup should be accepted against a stored expected amount.
 */
export function upiVerificationAmountAcceptable(verification, expectedAmount) {
  if (!verification?.verified) return false;
  if (vyaparPaymentVerified(verification)) return true;
  const paid = Number(verification.amount);
  const expected = Number(expectedAmount);
  if (!Number.isFinite(expected) || expected <= 0) return true;
  return paymentAmountsMatch(paid, expected);
}

/**
 * Compare gateway-reported amount (INR) with expected order/session amount.
 * Allows ₹1 tolerance for rounding.
 */
export function paymentAmountsMatch(paid, expected, tolerance = 1) {
  const paidNum = Number(paid);
  const expectedNum = Number(expected);
  if (!Number.isFinite(expectedNum) || expectedNum <= 0) return true;
  if (!Number.isFinite(paidNum)) return false;
  return Math.abs(paidNum - expectedNum) <= tolerance;
}

export function expectedGatewayAmountFromOrder(order) {
  return (
    Number(order?.paymentDetails?.gatewayAmount) ||
    Math.max(0, Number(order?.price || 0) - (Number(order?.walletDeduction?.amount) || 0))
  );
}

export function expectedGatewayAmountFromSession(session) {
  return Number(session?.gatewayAmount) || 0;
}

/**
 * Strict comparison for gateways that settle on an exact amount.
 *
 * VyaparGateway only marks an order paid when the credited amount matches the
 * requested one to the paise, so a discrepancy here means the record was
 * tampered with or the expected amount was stored wrong — not rounding. A paise
 * of slack absorbs float representation only.
 */
export function paymentAmountsMatchExact(paid, expected) {
  return paymentAmountsMatch(paid, expected, 0.01);
}

export function expectedRenewalGatewayAmount(order) {
  const pending = order?.pendingRenewal;
  if (!pending) return 0;
  return (
    Number(pending.gatewayAmount) ||
    Math.max(0, Number(pending.renewalPrice || pending.amount || 0) - (Number(pending.walletAmount) || 0))
  );
}
