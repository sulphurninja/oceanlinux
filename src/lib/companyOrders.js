/** Company portal: paid/provisioned orders only — hide pending, cancelled, failed. */
export const COMPANY_FILTER_VERSION = 'paid-orders-v6';

export const COMPANY_VISIBLE_ORDER_STATUSES = ['confirmed', 'active', 'paid'];

export function isCompanyVisibleOrder(orderOrStatus) {
  const status = String(
    typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus?.status ?? ''
  ).trim().toLowerCase();
  return COMPANY_VISIBLE_ORDER_STATUSES.includes(status);
}

export function buildCompanyStockIdVariants(stockIds = []) {
  const variants = new Set();
  for (const id of stockIds) {
    const value = String(id || '').trim();
    if (!value) continue;
    variants.add(value);
    if (/^[a-f0-9]{24}$/i.test(value)) variants.add(value.toLowerCase());
  }
  return [...variants];
}
