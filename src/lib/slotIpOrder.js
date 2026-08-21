/** True for one-time Slot IP proxy orders (no renewals). */
export function isSlotIpOrder(order) {
  if (!order) return false;
  return order.provider === 'slotip' || !!order.slotIpPackageId;
}

export const SLOT_IP_NO_RENEWAL_MESSAGE =
  'Slot IP orders cannot be renewed. Please purchase a new package when yours expires.';
