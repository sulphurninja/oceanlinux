const Order = require('@/models/orderModel').default;
const SlotIPPackage = require('@/models/slotIpPackageModel');

const DEFAULT_SLOT_IP_DAYS = 30;

function cutoffDate(olderThanDays = DEFAULT_SLOT_IP_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(olderThanDays) || DEFAULT_SLOT_IP_DAYS));
  return cutoff;
}

function firstValidDate(...values) {
  for (const value of values) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Sale date = jab customer ko IP mili (soldAt), not when IP package me add hui */
function saleDateForIp(ip, orderByIdMap, orderBySlotIpIdMap) {
  const linkedOrder = ip?.orderId ? orderByIdMap.get(String(ip.orderId)) : null;
  const orderBySlot = ip?._id ? orderBySlotIpIdMap.get(String(ip._id)) : null;
  return firstValidDate(ip?.soldAt, ip?.allocatedAt, orderBySlot?.createdAt, linkedOrder?.createdAt);
}

function wasEverSold(ip, orderByIdMap, orderBySlotIpIdMap) {
  if (ip?.soldAt || ip?.allocatedAt) return true;
  if (ip?.allocated) return true;
  if (ip?.orderId && orderByIdMap.has(String(ip.orderId))) return true;
  if (ip?._id && orderBySlotIpIdMap.has(String(ip._id))) return true;
  return false;
}

function isOrphanSoldRow(ip, orderByIdMap, orderBySlotIpIdMap) {
  if (!ip?.allocated && !ip?.soldAt && !ip?.allocatedAt) return false;
  if (ip?.orderId && orderByIdMap.has(String(ip.orderId))) return false;
  if (ip?._id && orderBySlotIpIdMap.has(String(ip._id))) return false;
  return !!(ip?.allocated || ip?.soldAt || ip?.allocatedAt);
}

function shouldRemoveIpRow(ip, orderByIdMap, orderBySlotIpIdMap, cutoff) {
  // Order pehle delete ho chuka — admin se row bhi hatao (galat re-lock / purani history)
  if (isOrphanSoldRow(ip, orderByIdMap, orderBySlotIpIdMap)) return true;
  if (!wasEverSold(ip, orderByIdMap, orderBySlotIpIdMap)) return false;
  const saleDate = saleDateForIp(ip, orderByIdMap, orderBySlotIpIdMap);
  if (!saleDate) return false;
  return saleDate.getTime() < cutoff.getTime();
}

function buildStaleSlotIpOrderQuery(olderThanDays = DEFAULT_SLOT_IP_DAYS) {
  return {
    createdAt: { $lt: cutoffDate(olderThanDays) },
    $or: [
      { provider: 'slotip' },
      { slotIpPackageId: { $exists: true, $nin: [null, ''] } },
    ],
  };
}

async function backfillSoldAtOnPackages(packages) {
  let updated = 0;
  for (const pkg of packages) {
    let changed = false;
    for (const ip of pkg.ips || []) {
      if (!ip.soldAt && ip.allocatedAt) {
        ip.soldAt = ip.allocatedAt;
        changed = true;
      }
    }
    if (changed) {
      pkg.markModified('ips');
      await pkg.save();
      updated += 1;
    }
  }
  return updated;
}

/**
 * Slot IP lifecycle:
 * - IP package me add → Available (kabhi delete nahi jab tak sell na ho)
 * - Sell hone par soldAt set
 * - soldAt + 30 din → order delete + IP row /admin/slotIps se delete
 */
async function purgeExpiredSlotIpHistory({ olderThanDays = DEFAULT_SLOT_IP_DAYS, dryRun = false } = {}) {
  const cutoff = cutoffDate(olderThanDays);
  const packages = await SlotIPPackage.find({}).select('name ips');

  if (!dryRun) {
    await backfillSoldAtOnPackages(packages);
  }

  const slotIpIds = [];
  const orderIds = new Set();

  for (const pkg of packages) {
    for (const ip of pkg.ips || []) {
      if (ip?._id) slotIpIds.push(String(ip._id));
      if (ip?.orderId) orderIds.add(String(ip.orderId));
    }
  }

  const ordersBySlotIp = slotIpIds.length
    ? await Order.find({ slotIpId: { $in: slotIpIds } })
        .select('_id createdAt slotIpPackageId slotIpId ipAddress customerEmail productName')
        .lean()
    : [];

  const orderByIdMap = new Map();
  const orderBySlotIpIdMap = new Map();

  for (const order of ordersBySlotIp) {
    orderByIdMap.set(String(order._id), order);
    if (order.slotIpId) orderBySlotIpIdMap.set(String(order.slotIpId), order);
  }

  if (orderIds.size) {
    const linkedOrders = await Order.find({ _id: { $in: [...orderIds] } })
      .select('_id createdAt slotIpPackageId slotIpId ipAddress customerEmail productName')
      .lean();
    for (const order of linkedOrders) {
      orderByIdMap.set(String(order._id), order);
      if (order.slotIpId) orderBySlotIpIdMap.set(String(order.slotIpId), order);
    }
  }

  const ipsToRemove = [];
  const orderIdsToDelete = new Set();

  for (const pkg of packages) {
    for (const ip of pkg.ips || []) {
      if (!shouldRemoveIpRow(ip, orderByIdMap, orderBySlotIpIdMap, cutoff)) continue;
      ipsToRemove.push({
        packageId: String(pkg._id),
        packageName: pkg.name,
        ipId: String(ip._id),
        proxy: ip.proxy,
        orderId: ip.orderId ? String(ip.orderId) : null,
        soldAt: saleDateForIp(ip, orderByIdMap, orderBySlotIpIdMap),
      });
      if (ip.orderId) orderIdsToDelete.add(String(ip.orderId));
      const bySlot = orderBySlotIpIdMap.get(String(ip._id));
      if (bySlot) orderIdsToDelete.add(String(bySlot._id));
    }
  }

  const staleOrders = await Order.find(buildStaleSlotIpOrderQuery(olderThanDays))
    .select('_id productName ipAddress createdAt slotIpPackageId slotIpId customerEmail')
    .lean();

  for (const order of staleOrders) {
    orderIdsToDelete.add(String(order._id));
  }

  if (dryRun) {
    return {
      dryRun: true,
      olderThanDays,
      cutoff: cutoff.toISOString(),
      ordersToDelete: orderIdsToDelete.size,
      ipsToRemove: ipsToRemove.length,
      orders: staleOrders.map((o) => ({
        id: String(o._id),
        ip: o.ipAddress,
        email: o.customerEmail,
        createdAt: o.createdAt,
      })),
      ips: ipsToRemove.map((row) => ({
        ...row,
        soldAt: row.soldAt?.toISOString?.() || row.soldAt,
      })),
    };
  }

  let ordersDeleted = 0;
  const deletedOrders = [];

  for (const orderId of orderIdsToDelete) {
    const order = orderByIdMap.get(orderId) || (await Order.findById(orderId).lean());
    const del = await Order.findByIdAndDelete(orderId);
    if (!del) continue;
    ordersDeleted += 1;
    deletedOrders.push({
      id: orderId,
      ip: order?.ipAddress || null,
      email: order?.customerEmail || null,
    });
  }

  const removedByPackage = new Map();
  for (const row of ipsToRemove) {
    if (!removedByPackage.has(row.packageId)) removedByPackage.set(row.packageId, new Set());
    removedByPackage.get(row.packageId).add(row.ipId);
  }

  let ipsRemoved = 0;
  for (const [packageId, ipIdSet] of removedByPackage.entries()) {
    const pkg = await SlotIPPackage.findById(packageId);
    if (!pkg) continue;
    const before = pkg.ips.length;
    pkg.ips = pkg.ips.filter((ip) => !ipIdSet.has(String(ip._id)));
    ipsRemoved += before - pkg.ips.length;
    if (before !== pkg.ips.length) {
      pkg.markModified('ips');
      await pkg.save();
    }
  }

  return {
    dryRun: false,
    olderThanDays,
    cutoff: cutoff.toISOString(),
    ordersDeleted,
    ipsRemoved,
    deletedOrders,
    removedIps: ipsToRemove,
  };
}

module.exports = {
  DEFAULT_SLOT_IP_DAYS,
  purgeExpiredSlotIpHistory,
  buildStaleSlotIpOrderQuery,
  saleDateForIp,
  shouldRemoveIpRow,
};
