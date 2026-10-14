const Order = require('@/models/orderModel').default;

/** Longer than a SmartVPS renew + status read, short enough for a crashed worker to be retried. */
const CLAIM_STALE_MS = 3 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Only one request may call the provider renew API for a renewalTxnId.
 * Browser confirm, the gateway webhook, and the payment-status poll all
 * reach this path together. The DB expiry claim used to run AFTER the API,
 * so SmartVPS was charged twice while only one renewal row was saved.
 */
async function claimRenewalUpstream(orderId, renewalTxnId) {
  const txnId = String(renewalTxnId || '').trim();
  if (!orderId || !txnId) return { won: true };

  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      renewalPayments: { $not: { $elemMatch: { renewalTxnId: txnId } } },
      $or: [
        { 'pendingRenewal.upstreamClaimTxnId': { $exists: false } },
        { 'pendingRenewal.upstreamClaimTxnId': { $ne: txnId } },
        { 'pendingRenewal.upstreamClaimedAt': { $lte: staleBefore } },
      ],
    },
    {
      $set: {
        'pendingRenewal.upstreamClaimTxnId': txnId,
        'pendingRenewal.upstreamClaimedAt': new Date(),
      },
    },
    { new: true }
  );

  if (claimed) return { won: true };

  const current = await Order.findById(orderId)
    .select('renewalPayments expiryDate')
    .lean();
  const existing = current?.renewalPayments?.find((rp) => rp.renewalTxnId === txnId);
  if (existing) {
    return {
      won: false,
      alreadyProcessed: true,
      expiryDate: existing.newExpiry || current?.expiryDate,
    };
  }
  return { won: false, inProgress: true, expiryDate: current?.expiryDate };
}

async function waitForRenewalApplied(orderId, renewalTxnId, timeoutMs = 25000) {
  const txnId = String(renewalTxnId || '').trim();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await Order.findById(orderId)
      .select('renewalPayments expiryDate')
      .lean();
    const existing = current?.renewalPayments?.find((rp) => rp.renewalTxnId === txnId);
    if (existing) {
      return {
        applied: true,
        expiryDate: existing.newExpiry || current.expiryDate,
      };
    }
    await sleep(400);
  }
  return { applied: false };
}

async function acquireRenewalUpstream(orderId, renewalTxnId) {
  const claim = await claimRenewalUpstream(orderId, renewalTxnId);
  if (claim.won) return { proceed: true };
  if (claim.alreadyProcessed) {
    return { proceed: false, alreadyProcessed: true, expiryDate: claim.expiryDate };
  }
  const waited = await waitForRenewalApplied(orderId, renewalTxnId);
  if (waited.applied) {
    return { proceed: false, alreadyProcessed: true, expiryDate: waited.expiryDate };
  }
  return { proceed: false, inProgress: true, expiryDate: claim.expiryDate };
}

module.exports = {
  claimRenewalUpstream,
  acquireRenewalUpstream,
};
