const AdvpsAPI = require('@/services/advpsApi');
const {
  unwrapAdvpsEnvelope,
  extractAdvpsStatusCredentials,
} = require('@/lib/advpsStatusNormalize');

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

/** Try to discover purchase order ID (e.g. VPS040426-0008) from status/details payloads. */
function pickAdvpsPurchaseOrderId(payload) {
  const d = unwrapAdvpsEnvelope(payload) || payload || {};
  const candidates = [
    d.orderId,
    d.purchaseOrderId,
    d.purchaseId,
    d.order?.orderId,
    d.order?.id,
    d.service?.orderId,
    d.service?.purchaseOrderId,
    d.service?.purchaseId,
  ];
  for (const raw of candidates) {
    const id = String(raw || '').trim();
    if (/^(VPS|LXC)\d{6}-\d{4}$/i.test(id)) return id.toUpperCase();
  }
  return '';
}

function serviceIdMatchesPurchaseRow(services, serviceId) {
  const target = String(serviceId || '').trim().toLowerCase();
  if (!target || !services?.length) return false;

  return services.some((svc) => {
    const extracted = AdvpsAPI.extractServiceIdFromPurchaseService(svc);
    const candidates = [extracted, svc?.serviceId, svc?.service_id, svc?.id, svc?._id]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());
    return candidates.includes(target);
  });
}

/**
 * Resolve ADVPS purchase order ID from service ID when not stored on the order.
 * Tries status payload → sibling orders in DB → scan known purchase IDs in DB.
 */
async function resolveAdvpsPurchaseOrderIdForService(api, order, { statusPayload, Order } = {}) {
  const existing = resolveAdvpsPurchaseOrderId(order);
  if (existing) return existing;

  if (statusPayload) {
    const fromStatus = pickAdvpsPurchaseOrderId(statusPayload);
    if (fromStatus) return fromStatus;

    const d = unwrapAdvpsEnvelope(statusPayload) || {};
    const nested = pickAdvpsPurchaseOrderId(d.service || {});
    if (nested) return nested;
  }

  const serviceId = String(order?.advpsServiceId || '').trim();
  if (!serviceId || !Order) return '';

  const sibling = await Order.findOne({
    advpsServiceId: serviceId,
    advpsOrderId: { $exists: true, $ne: '' },
    _id: { $ne: order._id },
  })
    .select('advpsOrderId')
    .lean();
  if (sibling?.advpsOrderId) {
    console.log(`[ADVPS-RESOLVE] Matched purchase ${sibling.advpsOrderId} via sibling order for service ${serviceId}`);
    return String(sibling.advpsOrderId).trim();
  }

  const query = {
    advpsOrderId: { $exists: true, $ne: '' },
    _id: { $ne: order._id },
  };
  if (order.user) {
    query.$or = [{ user: order.user }, { advpsServiceId: serviceId }];
  } else {
    query.advpsServiceId = serviceId;
  }

  const candidates = await Order.find(query)
    .sort({ updatedAt: -1 })
    .limit(15)
    .select('advpsOrderId')
    .lean();

  const checked = new Set();
  for (const row of candidates) {
    const purchaseId = String(row.advpsOrderId || '').trim();
    if (!purchaseId || checked.has(purchaseId)) continue;
    checked.add(purchaseId);

    try {
      const detailsRes = await api.getOrderDetails(purchaseId);
      const { services } = normalizePurchaseOrderDetails(detailsRes);
      if (serviceIdMatchesPurchaseRow(services, serviceId)) {
        console.log(`[ADVPS-RESOLVE] Matched purchase ${purchaseId} for service ${serviceId} via order scan`);
        return purchaseId;
      }
    } catch (err) {
      console.warn(`[ADVPS-RESOLVE] getOrderDetails(${purchaseId}) failed:`, err.message);
    }
  }

  return '';
}

function applyCredentialField(dbUpdates, changes, field, dbKey, freshValue, currentValue) {
  const next = String(freshValue || '').trim();
  const prev = String(currentValue || '').trim();
  if (!next || next === prev) return false;
  dbUpdates[dbKey] = next;
  if (!changes.includes(field)) changes.push(field);
  return true;
}

/**
 * Pull live IP/username/password from ADVPS status + purchase order details and build DB updates.
 * Service ID alone is enough for credentials — ADVPS /status returns ip, username, password.
 */
async function syncAdvpsOrderCredentials(api, order, { statusPayload, Order } = {}) {
  const dbUpdates = { lastSyncTime: new Date() };
  const changes = [];
  let credentialsUpdated = false;
  let advpsOrderIdMissing = false;

  let purchaseOrderId = resolveAdvpsPurchaseOrderId(order);
  if (!purchaseOrderId) {
    advpsOrderIdMissing = true;
  }

  // Credentials from /status — works with service ID only (no purchase order ID required)
  if (statusPayload) {
    const statusCreds = extractAdvpsStatusCredentials(statusPayload, order);

    if (applyCredentialField(dbUpdates, changes, 'ip', 'ipAddress', statusCreds.ip, order.ipAddress)) {
      credentialsUpdated = true;
    }
    if (applyCredentialField(dbUpdates, changes, 'username', 'username', statusCreds.username, order.username)) {
      credentialsUpdated = true;
    }
    if (applyCredentialField(dbUpdates, changes, 'password', 'password', statusCreds.password, order.password)) {
      credentialsUpdated = true;
    }
    if (statusCreds.os) {
      const normalizedOs = statusCreds.os.toLowerCase().includes('windows')
        ? 'Windows 2022 64'
        : statusCreds.os.toLowerCase().includes('ubuntu')
          ? 'Ubuntu 22'
          : statusCreds.os.toLowerCase().includes('centos')
            ? 'CentOS 7'
            : statusCreds.os;
      if (applyCredentialField(dbUpdates, changes, 'os', 'os', normalizedOs, order.os)) {
        credentialsUpdated = true;
      }
    }
    if (statusCreds.expiryDate && !order.expiryDate) {
      dbUpdates.expiryDate = new Date(statusCreds.expiryDate);
      changes.push('expiryDate');
      credentialsUpdated = true;
    }
  }

  // Auto-resolve purchase order ID from service ID when missing
  if (!purchaseOrderId) {
    const resolved = await resolveAdvpsPurchaseOrderIdForService(api, order, { statusPayload, Order });
    if (resolved) {
      purchaseOrderId = resolved;
      dbUpdates.advpsOrderId = resolved;
      advpsOrderIdMissing = false;
      if (!changes.includes('advpsOrderId')) changes.push('advpsOrderId');
      credentialsUpdated = true;
      console.log(`[ADVPS-SYNC] Auto-linked purchase order ID ${resolved} for service ${order.advpsServiceId}`);
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
        const currentIp = dbUpdates.ipAddress ?? order.ipAddress;
        const currentUsername = dbUpdates.username ?? order.username;
        const currentPassword = dbUpdates.password ?? order.password;
        const currentOs = dbUpdates.os ?? order.os;

        if (applyCredentialField(dbUpdates, changes, 'ip', 'ipAddress', fresh.ip, currentIp)) {
          credentialsUpdated = true;
        }
        if (applyCredentialField(dbUpdates, changes, 'username', 'username', fresh.username, currentUsername)) {
          credentialsUpdated = true;
        }
        if (applyCredentialField(dbUpdates, changes, 'password', 'password', fresh.password, currentPassword)) {
          credentialsUpdated = true;
        }
        if (applyCredentialField(dbUpdates, changes, 'os', 'os', fresh.os, currentOs)) {
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
        purchaseOrderId: purchaseOrderId || null,
        freshIp: dbUpdates.ipAddress || order.ipAddress,
      };
    }
  }

  return {
    dbUpdates,
    credentialsUpdated,
    changes,
    advpsOrderIdMissing,
    purchaseOrderId: purchaseOrderId || resolveAdvpsPurchaseOrderId(order) || null,
    freshIp: dbUpdates.ipAddress || order.ipAddress,
  };
}

module.exports = {
  normalizePurchaseOrderDetails,
  pickAdvpsService,
  extractServiceCredentials,
  resolveAdvpsPurchaseOrderId,
  pickAdvpsPurchaseOrderId,
  resolveAdvpsPurchaseOrderIdForService,
  syncAdvpsOrderCredentials,
};
