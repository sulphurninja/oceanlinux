/** Company portal: confirmed (paid) orders only. */
export const COMPANY_VISIBLE_ORDER_STATUSES = ['confirmed'];

export function isCompanyVisibleOrder(orderOrStatus) {
  const status = String(
    typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus?.status ?? ''
  ).trim().toLowerCase();
  return status === 'confirmed';
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
