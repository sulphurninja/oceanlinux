const TrialVpsPackage = require('@/models/trialVpsPackageModel');
const Order = require('@/models/orderModel').default;

/**
 * Copy manageCompanyId / manageIpStockId from trial package onto orders that
 * were fulfilled before panel-manage fields existed on the order document.
 */
async function enrichTrialVpsPanelManageFromPackage(order) {
  if (!order?.trialVpsPackageId || !order.trialVpsSlotId) {
    return { order, updated: false };
  }

  const pkg = await TrialVpsPackage.findById(order.trialVpsPackageId)
    .select('manageCompanyId manageIpStockId planCategory')
    .lean();
  if (!pkg) return { order, updated: false };

  const category = String(pkg.planCategory || order.trialVpsPlanCategory || 'linux').toLowerCase();
  if (category === 'premium_proxy') return { order, updated: false };

  const manageCompanyId = pkg.manageCompanyId ? String(pkg.manageCompanyId) : '';
  const manageStockId = pkg.manageIpStockId ? String(pkg.manageIpStockId) : '';
  if (!manageCompanyId && !manageStockId) return { order, updated: false };

  const patch = {};
  if (!order.trialVpsPanelManage) patch.trialVpsPanelManage = true;
  if (manageCompanyId && !order.trialManageCompanyId) patch.trialManageCompanyId = manageCompanyId;
  if (manageStockId && !order.ipStockId) patch.ipStockId = manageStockId;

  if (!Object.keys(patch).length) {
    return { order, updated: false };
  }

  await Order.updateOne({ _id: order._id }, { $set: patch });
  return { order: { ...order, ...patch }, updated: true };
}

module.exports = { enrichTrialVpsPanelManageFromPackage };
