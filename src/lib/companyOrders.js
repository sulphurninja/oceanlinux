/** Order statuses shown in company portal — payment completed only. */
export const COMPANY_PAID_ORDER_STATUSES = ['confirmed', 'paid', 'active', 'completed'];

/** Never show these in company orders (unpaid, cancelled, or failed checkout). */
export const COMPANY_HIDDEN_ORDER_STATUSES = [
  'pending',
  'cancelled',
  'canceled',
  'cancel',
  'failed',
  'failure',
  'terminated',
  'expired',
  'invalid',
  'abandoned',
  'rejected',
];

export function normalizeOrderStatus(status) {
  return String(status || '').trim().toLowerCase();
}

/** True when status clearly means unpaid, cancelled, or failed. */
export function isHiddenCompanyOrderStatus(status) {
  const normalized = normalizeOrderStatus(status);
  if (!normalized) return true;
  if (COMPANY_HIDDEN_ORDER_STATUSES.includes(normalized)) return true;
  if (normalized.includes('cancel')) return true;
  if (normalized.includes('fail')) return true;
  if (normalized.includes('pending')) return true;
  if (normalized.includes('reject')) return true;
  return false;
}

/** Paid orders should have at least one payment confirmation signal. */
export function hasOrderPaymentProof(order) {
  if (!order) return false;

  const status = normalizeOrderStatus(order.status);
  if (['active', 'completed', 'paid'].includes(status)) return true;

  if (status === 'confirmed') {
    if (order.walletDeduction?.deducted) return true;
    if (order.paymentDetails?.walletOnly) return true;
    if (order.paymentDetails?.confirmedAt) return true;
    if (order.paymentDetails?.confirmedViaCheckout) return true;

    const txn = String(order.transactionId || '').trim();
    if (txn) return true;
  }

  return false;
}

export function isCompanyPaidOrder(orderOrStatus) {
  if (typeof orderOrStatus === 'string') {
    const status = normalizeOrderStatus(orderOrStatus);
    if (isHiddenCompanyOrderStatus(status)) return false;
    return COMPANY_PAID_ORDER_STATUSES.includes(status);
  }

  const order = orderOrStatus;
  const status = normalizeOrderStatus(order?.status);
  if (isHiddenCompanyOrderStatus(status)) return false;
  if (!COMPANY_PAID_ORDER_STATUSES.includes(status)) return false;
  return hasOrderPaymentProof(order);
}

export function buildCompanyStockIdVariants(stockIds = []) {
  const variants = new Set();
  for (const id of stockIds) {
    const value = String(id || '').trim();
    if (!value) continue;
    variants.add(value);
    if (/^[a-f0-9]{24}$/i.test(value)) {
      variants.add(value.toLowerCase());
    }
  }
  return [...variants];
}
