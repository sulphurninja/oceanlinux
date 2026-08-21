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

export function expectedRenewalGatewayAmount(order) {
  const pending = order?.pendingRenewal;
  if (!pending) return 0;
  return (
    Number(pending.gatewayAmount) ||
    Math.max(0, Number(pending.renewalPrice || pending.amount || 0) - (Number(pending.walletAmount) || 0))
  );
}
