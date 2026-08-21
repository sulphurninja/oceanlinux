/**
 * Pull latest IP, username, password, and power state from OceanLinux upstream.
 * Same response shape for every provider — reseller never needs provider-specific logic.
 */

import Order from '@/models/orderModel';
import { getDaysUntilExpiry } from '@/lib/expiryHelper';
import {
  executeResellerServerAction,
  loadOrderIpStock,
} from '@/lib/resellerServerManage';

function pickChanged(before, after) {
  const changed = [];
  if (before.ipAddress !== after.ipAddress) changed.push('ipAddress');
  if (before.username !== after.username) changed.push('username');
  if (before.password !== after.password) changed.push('password');
  if (before.os !== after.os) changed.push('os');
  const beforeExpiry = before.expiryDate ? new Date(before.expiryDate).toISOString() : null;
  const afterExpiry = after.expiryDate ? new Date(after.expiryDate).toISOString() : null;
  if (beforeExpiry !== afterExpiry) changed.push('validity');
  return changed;
}

function buildValidity(expiryDate) {
  if (!expiryDate) {
    return {
      expiryDate: null,
      daysRemaining: null,
      status: 'unknown',
    };
  }

  const daysRemaining = getDaysUntilExpiry(expiryDate);

  return {
    expiryDate: new Date(expiryDate).toISOString(),
    daysRemaining,
    status: daysRemaining >= 0 ? 'active' : 'expired',
  };
}

export async function syncResellerOrderCredentials(order, orderId, ipStock = null) {
  const stock = ipStock || (await loadOrderIpStock(order));
  const before = {
    ipAddress: order.ipAddress || null,
    username: order.username || null,
    password: order.password || null,
    os: order.os || null,
    expiryDate: order.expiryDate || null,
  };

  const manageResult = await executeResellerServerAction({
    order,
    orderId,
    action: 'sync',
    ipStock: stock,
  });

  const fresh = await Order.findById(orderId).lean();
  if (!fresh) {
    return { success: false, message: 'Order not found after sync', code: 'ORDER_NOT_FOUND' };
  }

  const credentials = {
    ipAddress: fresh.ipAddress || manageResult.data?.ip || before.ipAddress,
    username: fresh.username || before.username,
    password: fresh.password || before.password,
    os: fresh.os || before.os,
    expiryDate: fresh.expiryDate || before.expiryDate,
  };

  const powerState = manageResult.data?.powerState || null;
  const validity = buildValidity(credentials.expiryDate);

  return {
    success: manageResult.success,
    message: manageResult.message || 'Sync completed',
    ipAddress: credentials.ipAddress,
    username: credentials.username,
    password: credentials.password,
    os: credentials.os,
    validity,
    expiryDate: validity.expiryDate,
    daysRemaining: validity.daysRemaining,
    powerState,
    online: powerState === 'running',
    changed: pickChanged(before, credentials),
    credentialsUpdated: manageResult.data?.credentialsUpdated ?? pickChanged(before, credentials).length > 0,
    provisioningStatus: fresh.provisioningStatus || null,
  };
}

export async function getResellerOrderLiveStatus(order, orderId, ipStock = null) {
  const stock = ipStock || (await loadOrderIpStock(order));

  const result = await executeResellerServerAction({
    order,
    orderId,
    action: 'status',
    ipStock: stock,
  });

  const powerState = result.data?.powerState || 'unknown';

  return {
    success: result.success,
    message: result.message || 'Status retrieved',
    online: powerState === 'running',
    powerState,
    ipAddress: result.data?.ip || order.ipAddress || null,
  };
}
