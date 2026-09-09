const SlotIPPackage = require('@/models/slotIpPackageModel');
const Order = require('@/models/orderModel').default;

/** Canonical key for "same proxy" — ip:port or full proxy string. */
function slotProxyKey({ proxy, ip, port, ipAddress } = {}) {
  if (proxy) return String(proxy).trim().toLowerCase();
  if (ip && port) return `${ip}:${port}`.trim().toLowerCase();
  if (ipAddress) {
    const parts = String(ipAddress).trim().toLowerCase().split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  }
  return '';
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

/** End-customer identity — block re-assigning the same proxy to the same buyer. */
function buyerIdentity(order) {
  const emails = new Set(
    [order.customerEmail, order.apiMetadata?.endUserEmail, order.paymentDetails?.endUserEmail]
      .map(normalizeEmail)
      .filter(Boolean)
  );
  return {
    userId: order.user ? String(order.user) : null,
    emails,
  };
}

async function proxyKeysAlreadyOwnedByBuyer(order, packageId) {
  const buyer = buyerIdentity(order);
  if (!buyer.userId && buyer.emails.size === 0) return new Set();

  const orClauses = [];
  if (buyer.userId) orClauses.push({ user: order.user });
  if (buyer.emails.size) {
    const emailList = [...buyer.emails];
    orClauses.push({ customerEmail: { $in: emailList } });
    orClauses.push({ 'apiMetadata.endUserEmail': { $in: emailList } });
  }

  const prior = await Order.find({
    _id: { $ne: order._id },
    slotIpPackageId: String(packageId),
    status: { $nin: ['failed', 'cancelled', 'expired', 'superseded'] },
    $or: orClauses,
  }).select('ipAddress slotIpId');

  const keys = new Set();
  for (const row of prior) {
    const key = slotProxyKey({ ipAddress: row.ipAddress });
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Allocate an unassigned slot IP to a confirmed order. Idempotent if slotIpId exists.
 * Same proxy may appear on multiple package rows (multi-sale). Never assign the same
 * proxy twice to the same buyer — pick the next available row for a different user.
 */
async function allocateSlotIpForOrder(order) {
  if (!order?.slotIpPackageId || order.slotIpId) {
    return { allocated: false, skipped: true };
  }

  try {
    const pkg = await SlotIPPackage.findById(order.slotIpPackageId);
    if (!pkg) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Slot IP package not found';
      await order.save();
      return { allocated: false, reason: 'package_not_found' };
    }

    const ownedKeys = await proxyKeysAlreadyOwnedByBuyer(order, order.slotIpPackageId);
    const candidates = (pkg.ips || []).filter((ip) => {
      if (ip.allocated) return false;
      const key = slotProxyKey(ip);
      if (key && ownedKeys.has(key)) return false;
      return true;
    });

    if (!candidates.length) {
      const msg = ownedKeys.size
        ? 'No new slot IPs available for this customer (same proxy already assigned)'
        : 'No available slot IPs in this package';
      order.provisioningStatus = 'failed';
      order.provisioningError = msg;
      await order.save();
      return { allocated: false, reason: ownedKeys.size ? 'same_user_same_proxy' : 'no_ips_available' };
    }

    let slotIp = null;
    for (const candidate of candidates) {
      const updated = await SlotIPPackage.findOneAndUpdate(
        {
          _id: order.slotIpPackageId,
          'ips._id': candidate._id,
          'ips.allocated': false,
        },
        {
          $set: {
            'ips.$.allocated': true,
            'ips.$.orderId': order._id,
            'ips.$.allocatedAt': new Date(),
            'ips.$.soldAt': candidate.soldAt || new Date(),
          },
        },
        { new: true }
      );
      if (!updated) continue;
      slotIp = updated.ips.id(candidate._id);
      if (slotIp) break;
    }

    if (!slotIp) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Slot IP allocation race — retry';
      await order.save();
      return { allocated: false, reason: 'allocation_race' };
    }

    order.slotIpId = slotIp._id.toString();
    order.ipAddress = `${slotIp.ip}:${slotIp.port}`;
    order.username = slotIp.username;
    order.password = slotIp.password;
    order.provisioningStatus = 'active';
    order.autoProvisioned = true;
    order.provider = 'slotip';
    order.provisioningError = '';
    await order.save();

    return { allocated: true, slotIp: slotIp.proxy || order.ipAddress };
  } catch (err) {
    order.provisioningStatus = 'failed';
    order.provisioningError = `Slot IP allocation failed: ${err.message}`;
    await order.save();
    return { allocated: false, reason: err.message };
  }
}

module.exports = { allocateSlotIpForOrder, slotProxyKey };
