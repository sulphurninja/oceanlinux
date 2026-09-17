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
async function listExpiredTrialSlotsAwaitingRelease({ limit = 150 } = {}) {
  const now = new Date();
  const orders = await Order.find({
    trialVpsPackageId: { $exists: true, $nin: [null, ''] },
    trialVpsSlotId: { $exists: true, $nin: [null, ''] },
    expiryDate: { $ne: null, $lt: now },
  })
    .sort({ expiryDate: 1 })
    .limit(Math.min(500, Math.max(1, limit)))
    .select(
      '_id productName expiryDate trialVpsPackageId trialVpsSlotId customerEmail customerName ipAddress username'
    )
    .lean();

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

module.exports = {
  listExpiredTrialSlotsAwaitingRelease,
  releaseTrialSlotForResell,
};
