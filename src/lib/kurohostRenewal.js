/**
 * KuroHost has no hosting-style "renew" API — billing is PAYG until TERMINATE.
 * On company renewal approval we start a stopped/suspended VM and sync credentials.
 */

const { resolveKurohostApiForOrder, syncKurohostOrderFromApi } = require('@/lib/kurohostOrderSync');

function isKurohostOrder(order) {
  return order?.provider === 'kurohost' || !!order?.kurohostInstanceId;
}

/**
 * Run after company approves a renewal payment for a KuroHost-backed order.
 * @param {import('mongoose').Document} order
 * @param {import('mongoose').Model} Order
 */
async function executeKurohostRenewalOnApprove(order, { Order } = {}) {
  if (!isKurohostOrder(order) || !order.kurohostInstanceId) {
    return {
      success: false,
      skipped: true,
      message: 'Not a provisioned KuroHost order',
    };
  }

  const { api, error } = await resolveKurohostApiForOrder(order);
  if (!api) {
    return {
      success: false,
      message: error || 'KuroHost API not configured for this plan',
    };
  }

  const instanceId = order.kurohostInstanceId;
  const actions = [];
  let startResult = null;

  try {
    const detailRes = await api.getInstance(instanceId);
    const instance = detailRes?.instance || detailRes;
    const status = String(instance?.status || '').toUpperCase();

    if (status === 'TERMINATED') {
      return {
        success: false,
        message: 'KuroHost instance is TERMINATED — create a new VM manually or reprovision from admin.',
        instanceStatus: status,
      };
    }

    if (status === 'STOPPED' || status === 'SUSPENDED') {
      startResult = await api.startInstance(instanceId);
      actions.push('start');
      const jobId = startResult?.job?.id;
      if (jobId) {
        try {
          await api.waitForJob(jobId, { maxWaitMs: 180_000, pollIntervalMs: 4_000 });
        } catch (jobErr) {
          console.warn('[KUROHOST-RENEW] Start job poll:', jobErr.message);
        }
      }
    } else if (status === 'RUNNING') {
      actions.push('already_running');
    } else {
      actions.push(`status_${status.toLowerCase() || 'unknown'}`);
    }
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Failed to reach KuroHost instance',
      actions,
    };
  }

  let sync = { ok: false, dbUpdates: {}, changes: [] };
  try {
    sync = await syncKurohostOrderFromApi(order);
    if (sync.ok && Order && Object.keys(sync.dbUpdates).length) {
      await Order.findByIdAndUpdate(order._id, sync.dbUpdates);
    }
    if (sync.ok) actions.push('sync');
  } catch (syncErr) {
    console.error('[KUROHOST-RENEW] Sync after approve failed:', syncErr.message);
  }

  return {
    success: true,
    message: actions.includes('start')
      ? 'KuroHost VM started and credentials synced'
      : 'KuroHost instance synced (no start needed)',
    actions,
    startResult,
    syncChanges: sync.changes || [],
    credentialsUpdated: (sync.changes || []).some((c) => ['password', 'ipAddress', 'username'].includes(c)),
  };
}

module.exports = {
  isKurohostOrder,
  executeKurohostRenewalOnApprove,
};
