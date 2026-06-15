/** Only these statuses appear in /company orders tab. */
export const COMPANY_VISIBLE_ORDER_STATUSES = ['confirmed', 'active'];

/** @deprecated use COMPANY_VISIBLE_ORDER_STATUSES */
export const COMPANY_PAID_ORDER_STATUSES = COMPANY_VISIBLE_ORDER_STATUSES;

export function normalizeOrderStatus(status) {
  return String(status || '').trim().toLowerCase();
}

export function isCompanyVisibleOrder(orderOrStatus) {
  const status = normalizeOrderStatus(
    typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus?.status
  );

  if (!status) return false;
  if (status.includes('cancel')) return false;
  if (status.includes('fail')) return false;
  if (status.includes('pending')) return false;

  return status === 'confirmed' || status === 'active';
}

/** @deprecated use isCompanyVisibleOrder */
export function isCompanyPaidOrder(orderOrStatus) {
  return isCompanyVisibleOrder(orderOrStatus);
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
