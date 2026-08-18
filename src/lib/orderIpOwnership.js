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
  if (fromInventory) return fromInventory;

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
 */
function shouldSyncPanelDataToOrder(order, ctx = {}) {
  if (!order?._id || !order?.ipAddress) return false;

  const orderId = String(order._id);
  const ip = cleanOrderIp(order.ipAddress);
  if (!ip) return false;

  const ownerByIp = ctx.ownerByIp || new Map();
  const ownerByItemId = ctx.ownerByItemId || new Map();

  const inventoryOwner = ownerByIp.get(ip);
  if (inventoryOwner && inventoryOwner !== orderId) return false;

  if (order.inventoryItemId) {
    const itemOwner = ownerByItemId.get(String(order.inventoryItemId));
    if (itemOwner && itemOwner !== orderId) return false;
  }

  if (isOrderExpiredWithoutRenewal(order) && inventoryOwner !== orderId) {
    return false;
  }

  const ordersForIp =
    ctx.ordersByIp?.get(ip) ||
    (ctx.allOrders ? groupOrdersByIp(ctx.allOrders).get(ip) : null);

  if (ordersForIp && ordersForIp.length > 1) {
    const canonical = resolveCanonicalOwnerOrderId(ip, ordersForIp, ownerByIp);
    if (canonical && canonical !== orderId) return false;
  }

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
  if (!ipStockId || !currentId) return { detached: 0 };

  const candidates = await Order.find({
    _id: { $ne: currentOrderId },
    ipStockId: String(ipStockId),
    status: { $nin: ['cancelled', 'failed', 'expired', 'superseded'] },
    $or: [
      ...(inventoryItemId ? [{ inventoryItemId: String(inventoryItemId) }] : []),
      ...(ip
        ? [
            { ipAddress: ip },
            { ipAddress: new RegExp(`^${ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) },
          ]
        : []),
    ],
  }).select('_id ipAddress inventoryItemId');

  let detached = 0;
  for (const stale of candidates) {
    const staleIp = cleanOrderIp(stale.ipAddress);
    const sameItem =
      inventoryItemId && String(stale.inventoryItemId || '') === String(inventoryItemId);
    const sameIp = ip && staleIp === ip;
    if (!sameItem && !sameIp) continue;

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

module.exports = {
  cleanOrderIp,
  expiryMs,
  isOrderExpiredWithoutRenewal,
  buildInventoryOwnerMaps,
  groupOrdersByIp,
  resolveCanonicalOwnerOrderId,
  shouldSyncPanelDataToOrder,
  detachSupersededIpOrders,
};
