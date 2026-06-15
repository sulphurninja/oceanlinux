const AdvpsAPI = require('@/services/advpsApi');
const { pickAdvpsIp, unwrapAdvpsEnvelope } = require('@/lib/advpsStatusNormalize');

/**
 * Normalize GET /api/v1/purchase/{orderId} payloads.
 * Example: VPS040426-0008 → { order, services: [{ ip, username, password, serviceId }] }
 */
function normalizePurchaseOrderDetails(payload) {
  const root = payload?.data ?? payload ?? {};
  const order = root.order ?? root.purchase ?? root;
  const services = root.services ?? order?.services ?? [];
  return {
    order,
    services: Array.isArray(services) ? services : [],
  };
}

/** Pick the service row that matches our stored advpsServiceId when possible. */
function pickAdvpsService(services, advpsServiceId) {
  if (!services?.length) return null;

  if (!advpsServiceId) {
    return services.find((s) => s?.ip) || services[0];
  }

  const target = String(advpsServiceId).trim().toLowerCase();
  const matched = services.find((svc) => {
    const extracted = AdvpsAPI.extractServiceIdFromPurchaseService(svc);
    const candidates = [
      extracted,
      svc?.serviceId,
      svc?.service_id,
      svc?.id,
      svc?._id,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());
    return candidates.includes(target);
  });

  return matched || services.find((s) => s?.ip) || services[0];
}

function extractServiceCredentials(svc, order) {
  const isWindows = /windows|rdp/i.test(
    `${order?.productName || ''} ${svc?.os || ''} ${svc?.osName || ''}`
  );
  const ip = String(svc?.ip || svc?.ipv4 || svc?.address || '').trim();
  const username = String(
    svc?.username || svc?.user || (isWindows ? 'Administrator' : 'root')
  ).trim();
  const password = String(svc?.password || svc?.pass || '').trim();
  const os = String(svc?.os || svc?.osName || '').trim();
  return { ip, username, password, os };
}

function resolveAdvpsPurchaseOrderId(order) {
  return String(
    order?.advpsOrderId || order?.apiMetadata?.advpsOrderId || ''
  ).trim();
}

/**
 * Pull live IP/username/password from ADVPS purchase order details and build DB updates.
 * When admin changes IP on ADVPS (192 → 198), user Sync replaces local values automatically.
 */
async function syncAdvpsOrderCredentials(api, order, { statusPayload } = {}) {
  const dbUpdates = { lastSyncTime: new Date() };
  const changes = [];
  let credentialsUpdated = false;
  let advpsOrderIdMissing = false;

  const purchaseOrderId = resolveAdvpsPurchaseOrderId(order);
  if (!purchaseOrderId) {
    advpsOrderIdMissing = true;
  }

  // Live IP from /status as a secondary source
  if (statusPayload) {
    const statusIp = pickAdvpsIp(unwrapAdvpsEnvelope(statusPayload), '').trim();
    if (statusIp && statusIp !== String(order.ipAddress || '').trim()) {
      dbUpdates.ipAddress = statusIp;
      if (!changes.includes('ip')) changes.push('ip');
      credentialsUpdated = true;
    }
  }

  if (purchaseOrderId) {
    try {
      const detailsRes = await api.getOrderDetails(purchaseOrderId);
      const { services } = normalizePurchaseOrderDetails(detailsRes);
      const svc = pickAdvpsService(services, order.advpsServiceId);

      if (!svc) {
        console.warn(`[ADVPS-SYNC] Purchase ${purchaseOrderId} returned no services`);
      } else {
        const fresh = extractServiceCredentials(svc, order);

        if (fresh.ip && fresh.ip !== String(order.ipAddress || '').trim()) {
          dbUpdates.ipAddress = fresh.ip;
          if (!changes.includes('ip')) changes.push('ip');
          credentialsUpdated = true;
        }
        if (fresh.username && fresh.username !== String(order.username || '').trim()) {
          dbUpdates.username = fresh.username;
          changes.push('username');
          credentialsUpdated = true;
        }
        if (fresh.password && fresh.password !== String(order.password || '').trim()) {
          dbUpdates.password = fresh.password;
          changes.push('password');
          credentialsUpdated = true;
        }
        if (fresh.os && fresh.os !== String(order.os || '').trim()) {
          dbUpdates.os = fresh.os;
          changes.push('os');
          credentialsUpdated = true;
        }

        const extractedServiceId = AdvpsAPI.extractServiceIdFromPurchaseService(svc);
        if (extractedServiceId && extractedServiceId !== order.advpsServiceId) {
          dbUpdates.advpsServiceId = extractedServiceId;
          changes.push('advpsServiceId');
          credentialsUpdated = true;
        }

        if (!order.advpsOrderId) {
          dbUpdates.advpsOrderId = purchaseOrderId;
        }

        if (credentialsUpdated) {
          console.log(
            `[ADVPS-SYNC] Order ${order._id} updated from purchase ${purchaseOrderId}: ${changes.join(', ')}`
          );
        }
      }
    } catch (err) {
      console.error('[ADVPS-SYNC] getOrderDetails failed:', err.message);
      return {
        dbUpdates,
        credentialsUpdated,
        changes,
        advpsOrderIdMissing,
        error: err.message,
        freshIp: dbUpdates.ipAddress || order.ipAddress,
      };
    }
  }

  return {
    dbUpdates,
    credentialsUpdated,
    changes,
    advpsOrderIdMissing,
    freshIp: dbUpdates.ipAddress || order.ipAddress,
  };
}

module.exports = {
  normalizePurchaseOrderDetails,
  pickAdvpsService,
  extractServiceCredentials,
  resolveAdvpsPurchaseOrderId,
  syncAdvpsOrderCredentials,
};
