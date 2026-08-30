/**
 * Shared helpers for splitting orders between:
 *  - /dashboard/viewLinux  → paid servers (including while provisioning)
 *  - /dashboard/orders     → ALL orders (pending payment / failed / delivered history)
 */

import { getDaysUntilExpiryIST } from '@/lib/expiryHelper';

export type OrderLike = {
  status?: string;
  provisioningStatus?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  expiryDate?: Date | string;
  createdAt?: Date | string;
  provider?: string;
  slotIpPackageId?: string;
  hostycareServiceId?: string;
  smartvpsServiceId?: string;
  advpsServiceId?: string;
  provisioningError?: string;
  productName?: string;
  transactionId?: string;
};

/** Payment completed — awaiting or past delivery. */
export function isOrderPaid(order: OrderLike): boolean {
  const status = (order.status || '').toLowerCase();
  if (['confirmed', 'active', 'completed'].includes(status)) return true;
  // Wallet-only / webhook edge cases
  if (status !== 'pending' && status !== 'cancelled' && status !== 'canceled' && order.transactionId) {
    return true;
  }
  return false;
}

/** Full login details ready (IP + username + password). */
export function hasDeliveredCredentials(order: OrderLike): boolean {
  const ip = (order.ipAddress || '').trim();
  const user = (order.username || '').trim();
  const pwd = (order.password || '').trim();
  return !!(ip && user && pwd);
}

/**
 * Customer paid but admin/company has not delivered the server yet.
 * Show "Processing" — not "Failed" — until IP or service ID is assigned.
 */
export function isOrderAwaitingDelivery(order: OrderLike): boolean {
  if (!isOrderPaid(order)) return false;
  if (hasOrderBeenDelivered(order)) return false;
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();
  if (['terminated', 'cancelled', 'canceled'].includes(currentStatus)) return false;
  return true;
}

/**
 * Admin/upstream has handed the service to the customer — IP, service ID, or active status.
 * Does not require password (ADVPS often delivers before password sync).
 */
export function hasOrderBeenDelivered(order: OrderLike): boolean {
  const status = (order.status || '').toLowerCase();
  const ip = (order.ipAddress || '').trim();

  if (status === 'active' || status === 'completed') return true;
  if (ip) return true;
  if ((order.advpsServiceId || '').trim()) return true;
  if ((order.hostycareServiceId || '').trim()) return true;
  if ((order.smartvpsServiceId || '').trim()) return true;

  return false;
}

export function getDaysUntilExpiry(expiryDate: Date | string | null | undefined): number {
  if (!expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * True when the order belongs on /dashboard/viewLinux.
 * Paid orders show here while provisioning too — not only after IP is assigned.
 */
export function isServerListOrder(order: OrderLike): boolean {
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();

  if (['terminated', 'cancelled', 'canceled'].includes(currentStatus)) {
    return false;
  }

  if (!isOrderPaid(order)) {
    return false;
  }

  return hasOrderBeenDelivered(order) || isOrderAwaitingDelivery(order);
}

export type ServerStatus = 'active' | 'expired' | 'pending' | 'failed';

/** Status badge/filter logic for delivered servers on viewLinux. */
export function getServerDeliveryStatus(order: OrderLike): ServerStatus {
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();

  if (order.expiryDate && getDaysUntilExpiryIST(order.expiryDate) < 0) {
    return 'expired';
  }

  if (isOrderAwaitingDelivery(order)) {
    return 'pending';
  }

  if (currentStatus === 'failed' && !hasOrderBeenDelivered(order)) {
    return 'failed';
  }

  const isExplicitlyBad =
    currentStatus === 'suspended' ||
    currentStatus === 'terminated' ||
    currentStatus === 'cancelled' ||
    currentStatus === 'canceled';

  if (isOrderPaid(order) && hasOrderBeenDelivered(order) && !isExplicitlyBad) {
    return 'active';
  }

  if (currentStatus === 'completed' || currentStatus === 'active') {
    return 'active';
  }

  if (hasDeliveredCredentials(order) && !isExplicitlyBad) {
    return 'active';
  }

  return 'pending';
}

export type OrdersPageStatus = 'delivered' | 'pending' | 'failed' | 'cancelled';

/**
 * Status for /dashboard/orders.
 * `pending` = paid (or awaiting payment) but server not delivered yet.
 * `delivered` = handed to customer — even without password.
 */
export function getOrdersPageStatus(order: OrderLike): OrdersPageStatus {
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();

  if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
    return 'cancelled';
  }

  if (isOrderPaid(order) && hasOrderBeenDelivered(order)) {
    return 'delivered';
  }

  // Paid but not yet delivered (manual / slow company) → processing, not failed
  if (isOrderAwaitingDelivery(order)) {
    return 'pending';
  }

  if (currentStatus === 'failed' || currentStatus === 'terminated') {
    return 'failed';
  }

  // pending, confirmed (not delivered), provisioning (no IP/service yet), unpaid, etc.
  return 'pending';
}

/** @deprecated Use getOrdersPageStatus — orders page shows all orders now. */
export function getPipelineOrderStatus(order: OrderLike): OrdersPageStatus {
  return getOrdersPageStatus(order);
}

/** @deprecated Orders page shows all orders; kept for backwards compatibility. */
export function isOrdersPageOrder(_order: OrderLike): boolean {
  return true;
}

/** Poll after payment until IP/credentials land — avoids stale "Awaiting" until logout. */
export function shouldPollOrderForDelivery(order: OrderLike): boolean {
  if (!isOrderPaid(order)) return false;

  const status = (order.status || '').toLowerCase();
  const prov = (order.provisioningStatus || '').toLowerCase();
  if (['cancelled', 'canceled', 'terminated'].includes(status)) return false;
  if (['cancelled', 'canceled', 'terminated'].includes(prov)) return false;

  if (hasOrderBeenDelivered(order) && hasDeliveredCredentials(order)) {
    return false;
  }

  return (
    isOrderAwaitingDelivery(order) ||
    status === 'confirmed' ||
    prov === 'provisioning' ||
    prov === 'pending' ||
    prov === 'in_progress'
  );
}
