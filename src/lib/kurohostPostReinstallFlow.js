/**
 * After KuroHost POST /instances/{id}/actions/reinstall, poll the job and
 * sync order credentials. The reinstall password is the one we sent in the
 * request body (GET instance does not return decrypted root password).
 */

const KurohostApi = require('@/services/kurohostApi');
const { applyKurohostInstanceToOrderUpdates } = require('@/lib/kurohostOrderSync');

function mapKurohostOsLabel(templateName, isWindows) {
  const name = String(templateName || '').trim();
  if (!name) return isWindows ? 'Windows 2022 64' : 'Ubuntu 22';
  if (isWindows || /windows|win\s*server/i.test(name)) return 'Windows 2022 64';
  return name;
}

/**
 * @param {Object} params
 * @param {import('@/services/kurohostApi')} params.api
 * @param {import('mongoose').Model} params.Order
 * @param {string} params.orderId
 * @param {string} params.instanceId
 * @param {string} [params.jobId]
 * @param {string} [params.generatedPassword]
 * @param {string} [params.osTemplateName]
 * @param {boolean} [params.isWindows]
 * @param {string} [params.logPrefix='[KUROHOST-REINSTALL]']
 */
async function runKurohostPostReinstallFlow({
  api,
  Order,
  orderId,
  instanceId,
  jobId,
  generatedPassword,
  osTemplateName,
  isWindows,
  logPrefix = '[KUROHOST-REINSTALL]',
}) {
  if (jobId) {
    try {
      await api.waitForJob(jobId, {
        maxWaitMs: 600_000,
        pollIntervalMs: 4_000,
      });
      console.log(`${logPrefix} Job completed for order ${orderId} (instance ${instanceId})`);
    } catch (err) {
      console.error(`${logPrefix} Job poll error for order ${orderId}:`, err.message);
      await Order.findByIdAndUpdate(orderId, {
        provisioningStatus: 'failed',
        provisioningError: err.message || 'KuroHost reinstall job failed',
      });
      return { ok: false, error: err.message };
    }
  }

  const order = await Order.findById(orderId).lean();
  const detailRes = await api.getInstance(instanceId);
  const instance = KurohostApi.unwrapInstance(detailRes);
  const { dbUpdates, changes } = applyKurohostInstanceToOrderUpdates(instance, order || {});

  const update = {
    ...dbUpdates,
    provisioningStatus: 'active',
    provisioningError: '',
    lastSyncTime: new Date(),
  };

  if (generatedPassword) {
    update.password = generatedPassword;
  }

  const tplName = osTemplateName || instance?.osTemplate?.name || '';
  const tplWindows = isWindows ?? !!instance?.osTemplate?.isWindows;
  if (tplName || tplWindows != null) {
    update.os = mapKurohostOsLabel(tplName, tplWindows);
    update.username = tplWindows ? 'Administrator' : 'root';
  }

  await Order.findByIdAndUpdate(orderId, { $set: update });
  console.log(
    `${logPrefix} Reinstall synced for order ${orderId}${generatedPassword ? ' (password saved)' : ''}`
  );
  return { ok: true, changes, instance };
}

module.exports = {
  mapKurohostOsLabel,
  runKurohostPostReinstallFlow,
};
