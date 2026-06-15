/**
 * Shared helpers for splitting orders between:
 *  - /dashboard/viewLinux  → only delivered/active servers (IP + credentials)
 *  - /dashboard/orders     → ALL orders (full history + in-progress)
 */

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
};

export function hasDeliveredCredentials(order: OrderLike): boolean {
  const ip = (order.ipAddress || '').trim();
  const user = (order.username || '').trim();
  const pwd = (order.password || '').trim();
  return !!(ip && user && pwd);
}

export function getDaysUntilExpiry(expiryDate: Date | string | null | undefined): number {
  if (!expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * True when the order is delivered and should appear on /dashboard/viewLinux.
 * Requires IP + username + password. Paid-but-not-delivered stays off this page.
 */
export function isServerListOrder(order: OrderLike): boolean {
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();

  if (['terminated', 'cancelled', 'canceled'].includes(currentStatus)) {
    return false;
  }

  return hasDeliveredCredentials(order);
}

export type ServerStatus = 'active' | 'expired' | 'pending' | 'failed';

/** Status badge/filter logic for delivered servers on viewLinux. */
export function getServerDeliveryStatus(order: OrderLike): ServerStatus {
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();

  if (order.expiryDate && getDaysUntilExpiry(order.expiryDate) < 0) {
    return 'expired';
  }

  if (currentStatus === 'completed' || currentStatus === 'active') {
    return 'active';
  }

  const isExplicitlyBad =
    currentStatus === 'suspended' ||
    currentStatus === 'terminated' ||
    currentStatus === 'cancelled' ||
    currentStatus === 'canceled';

  if (hasDeliveredCredentials(order) && !isExplicitlyBad) {
    return 'active';
  }

  if (currentStatus === 'failed') {
    return 'failed';
  }

  return 'pending';
}

export type OrdersPageStatus = 'delivered' | 'pending' | 'failed' | 'cancelled';

/**
 * Status for /dashboard/orders — covers every order including paid-but-not-delivered.
 * `pending` = payment may be done but server/proxy not delivered yet.
 */
export function getOrdersPageStatus(order: OrderLike): OrdersPageStatus {
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();

  if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
    return 'cancelled';
  }

  if (currentStatus === 'failed' || currentStatus === 'terminated') {
    if (hasDeliveredCredentials(order)) {
      return 'delivered';
    }
    return 'failed';
  }

  if (hasDeliveredCredentials(order)) {
    return 'delivered';
  }

  // pending, confirmed, provisioning, etc. — paid or unpaid, not yet delivered
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
