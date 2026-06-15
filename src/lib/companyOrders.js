/** Order statuses shown in company portal — payment completed only. */
export const COMPANY_PAID_ORDER_STATUSES = ['confirmed', 'paid', 'active', 'completed'];

/** Never show these in company orders (unpaid, cancelled, or failed checkout). */
export const COMPANY_HIDDEN_ORDER_STATUSES = [
  'pending',
  'cancelled',
  'canceled',
  'failed',
  'terminated',
  'expired',
  'invalid',
];

export function normalizeOrderStatus(status) {
  return String(status || '').trim().toLowerCase();
}

export function isCompanyPaidOrder(orderOrStatus) {
  const status = normalizeOrderStatus(
    typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus?.status
  );
  if (!status || COMPANY_HIDDEN_ORDER_STATUSES.includes(status)) return false;
  return COMPANY_PAID_ORDER_STATUSES.includes(status);
}
