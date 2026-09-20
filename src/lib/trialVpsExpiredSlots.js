const mongoose = require('mongoose');
const TrialVpsPackage = require('@/models/trialVpsPackageModel');
const Order = require('@/models/orderModel').default;
const { trialVpsPlanCategoryLabel, inferTrialVpsPlanCategory } = require('@/lib/trialVpsCatalog');

function slotConnectionLine(slot, planCategory) {
  const ip = String(slot?.ipAddress || '').split(':')[0].trim();
  const cat = inferTrialVpsPlanCategory({ planCategory, slots: [slot] });
  if (cat === 'premium_proxy') {
    const port = String(slot?.port || '').trim() || '8000';
    return `${ip}:${port}`;
  }
  return ip;
}

/**
 * Trial ended but slot still marked allocated — ready for admin to reclaim & resell.
 */
const expiredListDismissedFilter = {
  $or: [{ trialExpiredListDismissedAt: { $exists: false } }, { trialExpiredListDismissedAt: null }],
};

async function listExpiredTrialSlotsAwaitingRelease({ limit = 150 } = {}) {
  const now = new Date();
  // Native collection — hot-reloaded Order model may omit new schema paths (strictQuery / strict).
  const orders = await Order.collection
    .find({
      trialVpsPackageId: { $exists: true, $nin: [null, ''] },
      trialVpsSlotId: { $exists: true, $nin: [null, ''] },
      expiryDate: { $ne: null, $lt: now },
      ...expiredListDismissedFilter,
    })
    .sort({ expiryDate: 1 })
    .limit(Math.min(500, Math.max(1, limit)))
    .project({
      productName: 1,
      expiryDate: 1,
      trialVpsPackageId: 1,
      trialVpsSlotId: 1,
      customerEmail: 1,
      customerName: 1,
      ipAddress: 1,
      username: 1,
    })
    .toArray();

  if (!orders.length) return [];

  const packageIds = [...new Set(orders.map((o) => String(o.trialVpsPackageId)))];
  const packages = await TrialVpsPackage.find({ _id: { $in: packageIds } }).lean();
  const pkgById = new Map(packages.map((p) => [String(p._id), p]));

  const rows = [];

  for (const order of orders) {
    const pkg = pkgById.get(String(order.trialVpsPackageId));
    if (!pkg?.slots?.length) continue;

    const slotId = String(order.trialVpsSlotId);
    const slot = pkg.slots.find((s) => String(s._id) === slotId);
    if (!slot || !slot.allocated) continue;

    const planCategory = pkg.planCategory || order.trialVpsPlanCategory;
    const expiredAt = new Date(order.expiryDate);
    const msAgo = now.getTime() - expiredAt.getTime();

    rows.push({
      orderId: String(order._id),
      packageId: String(pkg._id),
      packageName: pkg.name,
      slotId,
      planCategory: inferTrialVpsPlanCategory(pkg),
      planCategoryLabel: trialVpsPlanCategoryLabel(planCategory),
      ipLine: slotConnectionLine(slot, planCategory),
      ipAddress: slot.ipAddress,
      port: slot.port || '',
      username: slot.username,
      password: slot.password,
      os: slot.os,
      expiredAt: expiredAt.toISOString(),
      expiredDaysAgo: Math.max(0, Math.floor(msAgo / (24 * 60 * 60 * 1000))),
      customerEmail: order.customerEmail || order.customerName || '',
      orderProductName: order.productName || '',
    });
  }

  rows.sort((a, b) => new Date(a.expiredAt).getTime() - new Date(b.expiredAt).getTime());
  return rows;
}

/**
 * Mark slot free again after admin changed VPS password / reclaimed machine.
 */
async function releaseTrialSlotForResell({ packageId, slotId, password }) {
  const pkg = await TrialVpsPackage.findById(packageId);
  if (!pkg) return { ok: false, reason: 'package_not_found' };

  const slot = pkg.slots.id(slotId);
  if (!slot) return { ok: false, reason: 'slot_not_found' };
  if (!slot.allocated) return { ok: false, reason: 'already_released' };

  const order = slot.orderId
    ? await Order.findById(slot.orderId).select('expiryDate trialVpsSlotId').lean()
    : null;

  if (order?.expiryDate && new Date(order.expiryDate) > new Date()) {
    return { ok: false, reason: 'trial_still_active' };
  }

  if (password !== undefined && password !== null && String(password).trim()) {
    slot.password = String(password).trim();
  }

  slot.allocated = false;
  slot.orderId = null;
  slot.allocatedAt = null;

  await pkg.save();

  return { ok: true, packageId: String(pkg._id), slotId: String(slot._id) };
}

/**
 * Hide expired trial rows from the admin Expired IPs list after copy (does not release slots).
 */
async function dismissExpiredTrialListForOrders(orderIds) {
  const ids = [
    ...new Set(
      (orderIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id))
    ),
  ];
  if (!ids.length) return { updated: 0 };

  const now = new Date();
  const result = await Order.collection.updateMany(
    { _id: { $in: ids } },
    { $set: { trialExpiredListDismissedAt: now } }
  );

  return {
    updated: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  };
}

module.exports = {
  listExpiredTrialSlotsAwaitingRelease,
  releaseTrialSlotForResell,
  dismissExpiredTrialListForOrders,
};
