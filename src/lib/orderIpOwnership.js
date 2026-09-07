/**
 * Prevent panel/IP sync from reviving expired orders when the same VPS is resold.
 */

function cleanOrderIp(ipAddress) {
  return String(ipAddress || '').split(':')[0].trim();
}

function expiryMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Order past expiry with no renewal that extended service past now. */
function isOrderExpiredWithoutRenewal(order, nowMs = Date.now()) {
  try {
    const { isExpiredServiceForCustomer } = require('@/lib/expiryHelper');
    // Same IST calendar rule as the expired popup / Renew window (0 days still syncs).
    return isExpiredServiceForCustomer(order, nowMs);
  } catch {
    // fall through to timestamp check
  }

  const expMs = expiryMs(order?.expiryDate);
  if (expMs == null || expMs >= nowMs) return false;

  const renewals = Array.isArray(order?.renewalPayments) ? order.renewalPayments : [];
  for (const rp of renewals) {
    const newExp = expiryMs(rp?.newExpiry);
    if (newExp != null && newExp >= nowMs) return false;
  }
  return true;
}

function buildInventoryOwnerMaps(stockDocs = []) {
  const ownerByIp = new Map();
  const ownerByItemId = new Map();

  for (const stock of stockDocs) {
    for (const item of stock?.inventoryItems || []) {
      if (!item?.allocated || !item?.orderId) continue;
      const ownerId = String(item.orderId);
      const ip = cleanOrderIp(item.ipAddress);
      if (ip) ownerByIp.set(ip, ownerId);
      if (item._id) ownerByItemId.set(String(item._id), ownerId);
    }
  }

  return { ownerByIp, ownerByItemId };
}

function groupOrdersByIp(orders = []) {
  const byIp = new Map();
  for (const order of orders) {
    const ip = cleanOrderIp(order?.ipAddress);
    if (!ip) continue;
    const bucket = byIp.get(ip) || [];
    bucket.push(order);
    byIp.set(ip, bucket);
  }
  return byIp;
}

/**
 * Pick the single order that should receive panel expiry/creds for an IP.
 */
function resolveCanonicalOwnerOrderId(ip, ordersForIp = [], ownerByIp = new Map()) {
  const fromInventory = ownerByIp.get(ip);
  if (fromInventory) {
    const invOrder = ordersForIp.find((o) => String(o._id) === fromInventory);
    if (invOrder && !isOrderExpiredWithoutRenewal(invOrder)) return fromInventory;
  }

  const sorted = [...ordersForIp].sort((a, b) => {
    const aCreated = expiryMs(a?.createdAt) || 0;
    const bCreated = expiryMs(b?.createdAt) || 0;
    return bCreated - aCreated;
  });

  const active = sorted.find((o) => !isOrderExpiredWithoutRenewal(o));
  if (active) return String(active._id);

  return sorted[0] ? String(sorted[0]._id) : null;
}

/**
 * Should this order receive panel expiry / credential sync for its IP?
 * Expired orders never sync — prevents reviving old owners after IP resale.
 */
function shouldSyncPanelDataToOrder(order, ctx = {}) {
  if (!order?._id || !order?.ipAddress) return false;

  const orderId = String(order._id);
  const ip = cleanOrderIp(order.ipAddress);
  if (!ip) return false;

  if (isOrderExpiredWithoutRenewal(order)) {
    return false;
  }

  const ownerByIp = ctx.ownerByIp || new Map();
  const ownerByItemId = ctx.ownerByItemId || new Map();

  const ordersForIp =
    ctx.ordersByIp?.get(ip) ||
    (ctx.allOrders ? groupOrdersByIp(ctx.allOrders).get(ip) : null);

  const inventoryOwner = ownerByIp.get(ip);
  if (inventoryOwner && inventoryOwner !== orderId) {
    const invOrder = ordersForIp?.find((o) => String(o._id) === inventoryOwner);
    if (invOrder && !isOrderExpiredWithoutRenewal(invOrder)) return false;
  }

  if (order.inventoryItemId) {
    const itemOwner = ownerByItemId.get(String(order.inventoryItemId));
    if (itemOwner && itemOwner !== orderId) {
      const itemOrder = ordersForIp?.find((o) => String(o._id) === itemOwner);
      if (itemOrder && !isOrderExpiredWithoutRenewal(itemOrder)) return false;
    }
  }

  if (ordersForIp && ordersForIp.length > 1) {
    const canonical = resolveCanonicalOwnerOrderId(ip, ordersForIp, ownerByIp);
    if (canonical && canonical !== orderId) return false;
  }

  return true;
}

function buildOrderSyncContext(orders = [], stockDocs = []) {
  const { ownerByIp, ownerByItemId } = buildInventoryOwnerMaps(stockDocs);
  return {
    ownerByIp,
    ownerByItemId,
    ordersByIp: groupOrdersByIp(orders),
    allOrders: orders,
  };
}

function ipAddressRegex(ip) {
  const clean = cleanOrderIp(ip);
  if (!clean) return null;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Require end-of-IP (or port suffix) so 160.191.10.12 does not match 160.191.10.125.
  return new RegExp(`^${escaped}(?:$|:)`);
}

/** Another non-expired order already holds this IP — block duplicate provision. */
async function findActiveIpConflict(ip, currentOrderId, nowMs = Date.now()) {
  const Order = require('@/models/orderModel').default;
  const regex = ipAddressRegex(ip);
  if (!regex) return null;

  const others = await Order.find({
    _id: { $ne: currentOrderId },
    status: { $nin: ['cancelled', 'failed', 'expired', 'superseded'] },
    ipAddress: regex,
  }).select('_id createdAt expiryDate renewalPayments status ipAddress clientTxnId');

  for (const other of others) {
    if (!isOrderExpiredWithoutRenewal(other, nowMs)) {
      return other;
    }
  }
  return null;
}

/** Clear credentials on expired orders that still show as active in the dashboard. */
async function markOrderExpiredIfPastDue(order) {
  if (!order?._id || !isOrderExpiredWithoutRenewal(order)) return false;
  if (['expired', 'cancelled', 'failed', 'superseded'].includes(String(order.status || ''))) {
    return false;
  }

  const { isWithinRenewalWindow } = require('@/lib/expiryHelper');
  const inRenewalWindow = isWithinRenewalWindow(order.expiryDate);

  const Order = require('@/models/orderModel').default;
  const update = {
    status: 'expired',
    provisioningStatus: inRenewalWindow ? 'expired' : 'terminated',
    lastSyncTime: new Date(),
  };

  // Keep IP/credentials while renewal is still open (2 days before → expiry day).
  if (!inRenewalWindow) {
    update.ipAddress = '';
    update.username = '';
    update.password = '';
  }

  await Order.findByIdAndUpdate(order._id, { $set: update });
  return true;
}

/**
 * When inventory is reassigned, detach stale orders still holding the same IP/credentials.
 */
async function detachSupersededIpOrders({
  ipStockId,
  inventoryItemId,
  ipAddress,
  currentOrderId,
}) {
  const Order = require('@/models/orderModel').default;
  const ip = cleanOrderIp(ipAddress);
  const currentId = String(currentOrderId);
  if (!currentId || (!ip && !inventoryItemId)) return { detached: 0 };

  const currentOrder = await Order.findById(currentOrderId).select('createdAt').lean();
  const currentCreated = expiryMs(currentOrder?.createdAt) || 0;

  const ipRegex = ip ? ipAddressRegex(ip) : null;
  const orClauses = [];
  if (inventoryItemId) orClauses.push({ inventoryItemId: String(inventoryItemId) });
  if (ipRegex) orClauses.push({ ipAddress: ipRegex });
  if (!orClauses.length) return { detached: 0 };

  const query = {
    _id: { $ne: currentOrderId },
    status: { $nin: ['cancelled', 'failed', 'expired', 'superseded'] },
    $or: orClauses,
  };
  if (ipStockId) query.ipStockId = String(ipStockId);

  const candidates = await Order.find(query).select('_id ipAddress inventoryItemId createdAt expiryDate renewalPayments status');

  let detached = 0;
  for (const stale of candidates) {
    const staleIp = cleanOrderIp(stale.ipAddress);
    const sameItem =
      inventoryItemId && String(stale.inventoryItemId || '') === String(inventoryItemId);
    const sameIp = ip && staleIp === ip;
    if (!sameItem && !sameIp) continue;

    const staleCreated = expiryMs(stale.createdAt) || 0;
    const staleExpired = isOrderExpiredWithoutRenewal(stale);
    // Newer non-expired holder keeps the IP; older or expired orders are detached.
    if (!staleExpired && staleCreated >= currentCreated) continue;

    await Order.findByIdAndUpdate(stale._id, {
      $set: {
        status: 'expired',
        provisioningStatus: 'terminated',
        ipAddress: '',
        username: '',
        password: '',
        inventoryItemId: '',
        resellerVmId: '',
        lastSyncTime: new Date(),
      },
    });
    detached += 1;
  }

  return { detached };
}

/** Load sibling orders + inventory maps for panel sync ownership checks. */
async function loadSyncContextForOrder(order) {
  const Order = require('@/models/orderModel').default;
  const IPStock = require('@/models/ipStockModel');

  const ip = cleanOrderIp(order?.ipAddress);
  let siblings = [];
  if (ip) {
    const regex = ipAddressRegex(ip);
    if (regex) {
      siblings = await Order.find({
        ipAddress: regex,
        status: { $nin: ['cancelled', 'failed'] },
      }).lean();
    }
  }
  if (!siblings.length && order?._id) siblings = [order];

  let stockDocs = [];
  if (order?.ipStockId) {
    const stock = await IPStock.findById(order.ipStockId)
      .select('inventoryItems tags provider name defaultConfigurations company')
      .lean();
    if (stock) stockDocs = [stock];
  }

  return buildOrderSyncContext(siblings, stockDocs);
}

/** Returns filtered updates when panel sync is allowed; otherwise only lastSyncTime. */
async function guardPanelSyncUpdate(order, updates = {}) {
  if (!order?._id) {
    return { allowed: false, updates: {}, markedExpired: false, reason: 'no_order' };
  }

  // Netbay/Hostheaven etc. — upstream buy succeeds before IP appears; sync must
  // be able to write the first IP even though order.ipAddress is still empty.
  const incomingIp = cleanOrderIp(updates.ipAddress);
  const orderHasIp = !!cleanOrderIp(order.ipAddress);
  if (!orderHasIp && incomingIp) {
    if (isOrderExpiredWithoutRenewal(order)) {
      const markedExpired = await markOrderExpiredIfPastDue(order);
      return {
        allowed: false,
        updates: { lastSyncTime: new Date() },
        markedExpired,
        reason: 'order_expired',
      };
    }
    const conflict = await findActiveIpConflict(incomingIp, order._id);
    if (conflict) {
      return {
        allowed: false,
        updates: { lastSyncTime: new Date() },
        markedExpired: false,
        reason: 'ip_conflict',
      };
    }
    return {
      allowed: true,
      updates: { ...updates, lastSyncTime: updates.lastSyncTime || new Date() },
      markedExpired: false,
      reason: null,
    };
  }

  const ctx = await loadSyncContextForOrder(order);
  if (!shouldSyncPanelDataToOrder(order, ctx)) {
    const markedExpired = await markOrderExpiredIfPastDue(order);
    return {
      allowed: false,
      updates: { lastSyncTime: new Date() },
      markedExpired,
      reason: markedExpired ? 'order_expired' : 'not_current_ip_owner',
    };
  }

  return {
    allowed: true,
    updates: { ...updates, lastSyncTime: updates.lastSyncTime || new Date() },
    markedExpired: false,
    reason: null,
  };
}

/**
 * Apply panel expiry/credentials to an order (all providers).
 * Expired or superseded owners are not revived.
 */
async function commitPanelSyncToOrder(orderOrId, updates = {}) {
  const Order = require('@/models/orderModel').default;
  const order =
    orderOrId && orderOrId._id && orderOrId.ipAddress !== undefined
      ? orderOrId
      : await Order.findById(orderOrId).lean();
  if (!order) {
    return { applied: false, reason: 'order_not_found', updates: {} };
  }

  const guard = await guardPanelSyncUpdate(order, updates);
  const payload = guard.updates && Object.keys(guard.updates).length
    ? guard.updates
    : { lastSyncTime: new Date() };

  await Order.findByIdAndUpdate(order._id, { $set: payload });
  return {
    applied: guard.allowed,
    reason: guard.reason,
    markedExpired: guard.markedExpired,
    updates: payload,
  };
}

/**
 * Save a newly provisioned IP on an order; detach older/expired holders of the same IP.
 */
async function finalizeIpAssignmentForOrder(order, ipAddress, updateData = {}) {
  const Order = require('@/models/orderModel').default;
  const cleanIp = cleanOrderIp(ipAddress || updateData.ipAddress);
  if (!cleanIp) {
    await Order.findByIdAndUpdate(order._id, updateData);
    return { ipAddress: '', detached: 0 };
  }

  const conflict = await findActiveIpConflict(cleanIp, order._id);
  if (conflict) {
    const msg =
      `IP ${cleanIp} is already assigned to active order ${conflict._id} ` +
      `(${conflict.clientTxnId || 'existing customer'}). Will not duplicate this VPS.`;
    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'failed',
      provisioningError: msg,
      status: 'failed',
      autoProvisioned: true,
      failedAt: new Date(),
    });
    throw new Error(msg);
  }

  await Order.findByIdAndUpdate(order._id, { ...updateData, ipAddress: cleanIp });

  const detach = await detachSupersededIpOrders({
    ipStockId: order.ipStockId,
    ipAddress: cleanIp,
    currentOrderId: order._id,
  });

  return { ipAddress: cleanIp, detached: detach.detached || 0 };
}

module.exports = {
  cleanOrderIp,
  expiryMs,
  isOrderExpiredWithoutRenewal,
  buildInventoryOwnerMaps,
  groupOrdersByIp,
  buildOrderSyncContext,
  resolveCanonicalOwnerOrderId,
  shouldSyncPanelDataToOrder,
  findActiveIpConflict,
  markOrderExpiredIfPastDue,
  detachSupersededIpOrders,
  ipAddressRegex,
  loadSyncContextForOrder,
  guardPanelSyncUpdate,
  commitPanelSyncToOrder,
  finalizeIpAssignmentForOrder,
};
