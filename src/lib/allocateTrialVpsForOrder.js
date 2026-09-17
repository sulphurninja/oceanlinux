const TrialVpsPackage = require('@/models/trialVpsPackageModel');
const Order = require('@/models/orderModel').default;

const VALID_OS = ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'];

function normalizeOs(raw) {
  const s = String(raw || '').trim();
  if (VALID_OS.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.includes('windows')) return 'Windows 2022 64';
  if (lower.includes('centos')) return 'CentOS 7';
  return 'Ubuntu 22';
}

/**
 * Assign a pre-uploaded trial VPS row to a paid order. Idempotent if trialVpsSlotId exists.
 */
async function allocateTrialVpsForOrder(order) {
  if (!order?.trialVpsPackageId || order.trialVpsSlotId) {
    return { allocated: false, skipped: true };
  }

  try {
    const pkg = await TrialVpsPackage.findById(order.trialVpsPackageId);
    if (!pkg) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Trial VPS package not found';
      await order.save();
      return { allocated: false, reason: 'package_not_found' };
    }

    const candidates = (pkg.slots || []).filter((s) => !s.allocated);
    if (!candidates.length) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'No trial VPS slots available in this package';
      await order.save();
      return { allocated: false, reason: 'no_slots_available' };
    }

    let slot = null;
    for (const candidate of candidates) {
      const updated = await TrialVpsPackage.findOneAndUpdate(
        {
          _id: order.trialVpsPackageId,
          'slots._id': candidate._id,
          'slots.allocated': false,
        },
        {
          $set: {
            'slots.$.allocated': true,
            'slots.$.orderId': order._id,
            'slots.$.allocatedAt': new Date(),
            'slots.$.soldAt': candidate.soldAt || new Date(),
          },
        },
        { new: true }
      );
      if (!updated) continue;
      slot = updated.slots.id(candidate._id);
      if (slot) break;
    }

    if (!slot) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Trial VPS allocation race — retry';
      await order.save();
      return { allocated: false, reason: 'allocation_race' };
    }

    const os = normalizeOs(slot.os);
    const category = pkg.planCategory || 'linux';
    const ipOnly = String(slot.ipAddress).split(':')[0].trim();

    order.trialVpsSlotId = slot._id.toString();
    order.trialVpsPlanCategory = category;

    const manageCompanyId = pkg.manageCompanyId ? String(pkg.manageCompanyId) : '';
    const manageStockId = pkg.manageIpStockId ? String(pkg.manageIpStockId) : '';
    if (category !== 'premium_proxy' && (manageCompanyId || manageStockId)) {
      order.trialVpsPanelManage = true;
      order.trialManageCompanyId = manageCompanyId || '';
      if (manageStockId) order.ipStockId = manageStockId;
    } else {
      order.trialVpsPanelManage = false;
      order.trialManageCompanyId = '';
    }

    if (category === 'premium_proxy') {
      const port = String(slot.port || '').trim() || '8000';
      order.ipAddress = `${ipOnly}:${port}`;
    } else {
      order.ipAddress = ipOnly;
    }
    order.username = slot.username;
    order.password = slot.password;
    order.os = os;
    order.provisioningStatus = 'active';
    order.autoProvisioned = true;
    order.provider = 'trialvps';
    order.provisioningError = '';
    order.status = 'active';

    const { calculateTrialExpiryDate } = require('@/lib/trialVpsBulkParse');
    order.expiryDate = calculateTrialExpiryDate(pkg.trialDays, new Date());

    await order.save();

    return { allocated: true, ipAddress: order.ipAddress, trialDays: pkg.trialDays };
  } catch (err) {
    order.provisioningStatus = 'failed';
    order.provisioningError = `Trial VPS allocation failed: ${err.message}`;
    await order.save();
    return { allocated: false, reason: err.message };
  }
}

module.exports = { allocateTrialVpsForOrder };
