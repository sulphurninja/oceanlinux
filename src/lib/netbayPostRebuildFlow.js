/**
 * After Netbay POST /services/:id/rebuild, poll the task and pull fresh
 * credentials from GET /services/:id (Netbay generates a new password).
 */

const NetbayApi = require('@/services/netbayApi');
const { pickNetbayExpiryDate } = require('@/lib/netbayOrderSync');

/**
 * @param {import('@/services/netbayApi')} api
 * @param {string} serviceId
 */
async function fetchNetbayServiceCredentials(api, serviceId) {
  const detailRes = await api.getService(serviceId);
  const svc = NetbayApi.unwrapServiceResponse(detailRes);
  return {
    ipAddress: NetbayApi.extractServiceIp(svc) || '',
    username: svc.username || '',
    password: svc.password || '',
    status: svc.status || '',
    os: svc.os || '',
    expiryDate: pickNetbayExpiryDate(svc),
  };
}

/**
 * Poll rebuild task → sync IP/username/password onto the order.
 *
 * @param {Object} params
 * @param {import('@/services/netbayApi')} params.api
 * @param {import('mongoose').Model} params.Order
 * @param {string} params.orderId
 * @param {string} params.serviceId
 * @param {string} [params.taskId]
 * @param {string} [params.logPrefix='[NETBAY-REBUILD]']
 */
async function runNetbayPostRebuildFlow({
  api,
  Order,
  orderId,
  serviceId,
  taskId,
  logPrefix = '[NETBAY-REBUILD]',
}) {
  if (taskId) {
    try {
      const task = await api.waitForTask(taskId, {
        maxWaitMs: 600_000,
        pollIntervalMs: 4_000,
      });
      const status = String(task?.status || '').toUpperCase();
      if (status === 'FAILED') {
        const errMsg = task?.error || task?.message || 'Netbay rebuild task failed';
        console.error(`${logPrefix} Task FAILED for order ${orderId}: ${errMsg}`);
        await Order.findByIdAndUpdate(orderId, {
          provisioningStatus: 'failed',
          provisioningError: errMsg,
        });
        return { ok: false, error: errMsg };
      }
      console.log(`${logPrefix} Task completed for order ${orderId} (service ${serviceId})`);
    } catch (err) {
      console.error(`${logPrefix} Task poll error for order ${orderId}:`, err.message);
      // Still try getService — task endpoint may 404 after completion.
    }
  }

  const creds = await fetchNetbayServiceCredentials(api, serviceId);
  const update = {
    provisioningStatus: 'active',
    provisioningError: '',
    lastSyncTime: new Date(),
  };
  if (creds.ipAddress) update.ipAddress = creds.ipAddress;
  if (creds.username) update.username = creds.username;
  if (creds.password) update.password = creds.password;
  if (creds.expiryDate) update.expiryDate = creds.expiryDate;

  const osStr = String(creds.os || '');
  if (osStr) {
    update.os = /windows|win\s*server/i.test(osStr) ? 'Windows 2022 64' : 'Ubuntu 22';
  }

  await Order.findByIdAndUpdate(orderId, { $set: update });
  console.log(`${logPrefix} Credentials synced for order ${orderId}${creds.password ? ' (new password)' : ''}`);
  return { ok: true, creds };
}

module.exports = {
  fetchNetbayServiceCredentials,
  runNetbayPostRebuildFlow,
};
