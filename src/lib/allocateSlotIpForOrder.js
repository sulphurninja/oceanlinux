const SlotIPPackage = require('@/models/slotIpPackageModel');

/**
 * Allocate an unassigned slot IP to a confirmed order. Idempotent if slotIpId exists.
 */
async function allocateSlotIpForOrder(order) {
  if (!order?.slotIpPackageId || order.slotIpId) {
    return { allocated: false, skipped: true };
  }

  try {
    const allocated = await SlotIPPackage.findOneAndUpdate(
      { _id: order.slotIpPackageId, 'ips.allocated': false },
      {
        $set: {
          'ips.$.allocated': true,
          'ips.$.orderId': order._id,
          'ips.$.allocatedAt': new Date(),
          'ips.$.soldAt': new Date(),
        },
      },
      { new: true }
    );

    if (!allocated) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'No available slot IPs in this package';
      await order.save();
      return { allocated: false, reason: 'no_ips_available' };
    }

    const slotIp = allocated.ips.find(
      (ip) => ip.orderId && ip.orderId.toString() === order._id.toString()
    );

    if (!slotIp) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Slot IP allocation mismatch';
      await order.save();
      return { allocated: false, reason: 'allocation_mismatch' };
    }

    order.slotIpId = slotIp._id.toString();
    order.ipAddress = `${slotIp.ip}:${slotIp.port}`;
    order.username = slotIp.username;
    order.password = slotIp.password;
    order.provisioningStatus = 'active';
    order.autoProvisioned = true;
    order.provider = 'slotip';
    await order.save();

    return { allocated: true, slotIp: slotIp.proxy || order.ipAddress };
  } catch (err) {
    order.provisioningStatus = 'failed';
    order.provisioningError = `Slot IP allocation failed: ${err.message}`;
    await order.save();
    return { allocated: false, reason: err.message };
  }
}

module.exports = { allocateSlotIpForOrder };
