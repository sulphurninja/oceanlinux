const AdvpsAPI = require('@/services/advpsApi');
const {
  unwrapAdvpsEnvelope,
  extractAdvpsStatusCredentials,
  pickAdvpsIp,
} = require('@/lib/advpsStatusNormalize');
const {
  deepCollectPasswords,
  pickPasswordCandidate,
  tryFetchAdvpsPasswordViaGenerate,
} = require('@/lib/advpsPasswordFetch');
const { pickAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');

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
  const password = String(
    svc?.password || svc?.pass || svc?.rootPassword || svc?.adminPassword || svc?.newPassword || ''
  ).trim();
  const os = String(svc?.os || svc?.osName || '').trim();
  const expiryDate = pickAdvpsExpiryDate(svc?.expiryDate, svc?.expiresAt);
  return { ip, username, password, os, expiryDate };
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

/** Pick the first non-empty candidate that differs from what is stored on the order. */
function pickChangedCredential(stored, ...candidates) {
  const prev = String(stored || '').trim();
  for (const raw of candidates) {
    const next = String(raw || '').trim();
    if (next && next !== prev) return next;
  }
  return '';
}

/**
 * Pull live IP/username/password from ADVPS status + purchase order endpoints.
 * Status API is live for IP; password/username use whichever source differs from stored order.
 */
async function syncAdvpsOrderCredentials(api, order, { statusPayload, statusError, Order, tryGeneratePasswordFallback = false } = {}) {
  const dbUpdates = { lastSyncTime: new Date() };
  const changes = [];
  let credentialsUpdated = false;
  let advpsOrderIdMissing = false;
  let purchaseError = null;
  let statusApiOk = Boolean(statusPayload);
  let purchaseApiOk = false;

  const statusCreds = statusPayload ? extractAdvpsStatusCredentials(statusPayload, order) : {};
  let statusPasswordDeep = new Set();
  let purchasePasswordDeep = new Set();
  let passwordSource = null;
  let passwordStale = false;
  let purchaseCreds = {};

  if (statusPayload) {
    statusPasswordDeep = deepCollectPasswords(statusPayload);
  }

  let purchaseOrderId = resolveAdvpsPurchaseOrderId(order);
  if (!purchaseOrderId) {
    advpsOrderIdMissing = true;
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
      purchaseApiOk = true;
      purchasePasswordDeep = deepCollectPasswords(detailsRes);
      const { services } = normalizePurchaseOrderDetails(detailsRes);
      const svc = pickAdvpsService(services, order.advpsServiceId);

      if (!svc) {
        console.warn(`[ADVPS-SYNC] Purchase ${purchaseOrderId} returned no services`);
      } else {
        purchaseCreds = extractServiceCredentials(svc, order);

        const extractedServiceId = AdvpsAPI.extractServiceIdFromPurchaseService(svc);
        if (extractedServiceId && extractedServiceId !== order.advpsServiceId) {
          dbUpdates.advpsServiceId = extractedServiceId;
          changes.push('advpsServiceId');
          credentialsUpdated = true;
        }

        if (!order.advpsOrderId) {
          dbUpdates.advpsOrderId = purchaseOrderId;
        }
      }
    } catch (err) {
      purchaseError = err.message;
      console.error('[ADVPS-SYNC] getOrderDetails failed:', err.message);
    }
  }

  // Merge live credentials — status IP is authoritative
  const mergedIp = statusCreds.ip || purchaseCreds.ip || '';
  let mergedPassword = pickPasswordCandidate(
    order.password,
    statusCreds.password,
    purchaseCreds.password,
    statusPasswordDeep,
    purchasePasswordDeep
  );

  if (!mergedPassword && tryGeneratePasswordFallback && order.advpsServiceId) {
    const gen = await tryFetchAdvpsPasswordViaGenerate(api, order.advpsServiceId);
    if (gen.password) {
      mergedPassword = pickPasswordCandidate(order.password, gen.password);
      if (mergedPassword) passwordSource = gen.source;
    } else if (gen.source === 'generate-locked') {
      passwordStale = true;
      console.log(`[ADVPS-SYNC] Order ${order._id} generate-password locked — ADVPS will not expose password via read APIs`);
    }
  }

  if (!mergedPassword) {
    if (statusCreds.password || purchaseCreds.password) {
      passwordStale = true;
    }
  } else {
    if (!passwordSource) {
      if (statusCreds.password === mergedPassword) passwordSource = 'status';
      else if (purchaseCreds.password === mergedPassword) passwordSource = 'purchase';
      else passwordSource = 'deep-scan';
    }
  }

  const mergedUsername = pickChangedCredential(
    order.username,
    statusCreds.username,
    purchaseCreds.username
  ) || statusCreds.username || purchaseCreds.username || '';

  if (applyCredentialField(dbUpdates, changes, 'ip', 'ipAddress', mergedIp, order.ipAddress)) {
    credentialsUpdated = true;
  }
  if (mergedPassword && applyCredentialField(dbUpdates, changes, 'password', 'password', mergedPassword, order.password)) {
    credentialsUpdated = true;
    console.log(`[ADVPS-SYNC] Order ${order._id} password updated (src: ${passwordSource || 'unknown'})`);
  }
  if (mergedUsername && applyCredentialField(dbUpdates, changes, 'username', 'username', mergedUsername, order.username)) {
    credentialsUpdated = true;
  }

  const mergedOs = statusCreds.os || purchaseCreds.os || '';
  if (mergedOs) {
    const normalizedOs = mergedOs.toLowerCase().includes('windows')
      ? 'Windows 2022 64'
      : mergedOs.toLowerCase().includes('ubuntu')
        ? 'Ubuntu 22'
        : mergedOs.toLowerCase().includes('centos')
          ? 'CentOS 7'
          : mergedOs;
    if (applyCredentialField(dbUpdates, changes, 'os', 'os', normalizedOs, order.os)) {
      credentialsUpdated = true;
    }
  }

  const mergedExpiry = pickAdvpsExpiryDate(statusCreds.expiryDate, purchaseCreds.expiryDate);
  if (mergedExpiry) {
    const prevMs = order.expiryDate ? new Date(order.expiryDate).getTime() : null;
    if (prevMs !== mergedExpiry.getTime()) {
      dbUpdates.expiryDate = mergedExpiry;
      changes.push('expiryDate');
      credentialsUpdated = true;
      console.log(
        `[ADVPS-SYNC] Order ${order._id} expiry from ADVPS: ${mergedExpiry.toISOString()} (was ${order.expiryDate ? new Date(order.expiryDate).toISOString() : 'unset'})`
      );
    }
  }

  if (credentialsUpdated) {
    console.log(`[ADVPS-SYNC] Order ${order._id} changes: ${changes.join(', ')}`);
  } else if (statusApiOk || purchaseApiOk) {
    console.log(
      `[ADVPS-SYNC] Order ${order._id} no credential changes (statusPwd=${statusCreds.password ? 'yes' : 'no'}, purchasePwd=${purchaseCreds.password ? 'yes' : 'no'}, deepStatus=${statusPasswordDeep.size}, deepPurchase=${purchasePasswordDeep.size}, stale=${passwordStale})`
    );
  }

  const primaryError = purchaseError || statusError || null;
  const apiBlocked = /IP address not allowed/i.test(primaryError || '');
  const syncFailed = !statusApiOk && !purchaseApiOk && Boolean(primaryError);

  return {
    dbUpdates,
    credentialsUpdated,
    changes,
    advpsOrderIdMissing,
    purchaseOrderId: purchaseOrderId || resolveAdvpsPurchaseOrderId(order) || null,
    freshIp: dbUpdates.ipAddress || order.ipAddress,
    freshExpiry: dbUpdates.expiryDate || order.expiryDate || null,
    statusApiOk,
    purchaseApiOk,
    statusError: statusError || null,
    purchaseError,
    error: syncFailed ? primaryError : purchaseError && !purchaseApiOk ? purchaseError : null,
    syncFailed,
    apiBlocked,
    passwordStale,
    passwordSource,
    passwordFoundInApi: Boolean(statusCreds.password || purchaseCreds.password || statusPasswordDeep.size || purchasePasswordDeep.size),
  };
}

/**
 * Resolve ADVPS purchase orderId + serviceId for POST /api/v1/services/renew.
 * Does NOT call GET .../status (renew docs only need orderId + serviceIds).
 */
async function resolveAdvpsIdsForRenewal(api, order, { Order } = {}) {
  const storedServiceId = String(order?.advpsServiceId || '').trim();
  if (!storedServiceId) {
    return { serviceId: '', advpsOrderId: '', error: 'No ADVPS service ID attached' };
  }

  const resolved = await resolveAdvpsServiceIdFromPurchase(api, order, storedServiceId, { Order });
  if (!resolved.advpsOrderId) {
    return {
      serviceId: storedServiceId,
      advpsOrderId: '',
      error: 'Missing ADVPS purchase order ID (advpsOrderId). Open the order and click Sync, or contact support.',
    };
  }

  return {
    serviceId: resolved.serviceId,
    advpsOrderId: resolved.advpsOrderId,
    corrected: resolved.corrected,
    previousServiceId: resolved.corrected ? resolved.previousServiceId : undefined,
  };
}

/** Shared: resolve canonical serviceId + purchase orderId from ADVPS purchase API (no /status). */
async function resolveAdvpsServiceIdFromPurchase(api, order, storedServiceId, { Order } = {}) {
  let purchaseOrderId = resolveAdvpsPurchaseOrderId(order);
  if (!purchaseOrderId && Order) {
    purchaseOrderId = await resolveAdvpsPurchaseOrderIdForService(api, order, { Order });
  }
  if (!purchaseOrderId) {
    return { serviceId: storedServiceId, advpsOrderId: '', corrected: false };
  }

  try {
    const detailsRes = await api.getOrderDetails(purchaseOrderId);
    const { services } = normalizePurchaseOrderDetails(detailsRes);
    const orderIp = String(order.ipAddress || '').split(':')[0].trim();
    const svc =
      pickAdvpsService(services, storedServiceId) ||
      (orderIp
        ? services.find((s) => String(s?.ip || s?.ipv4 || '').split(':')[0].trim() === orderIp)
        : null) ||
      (services.length === 1 ? services[0] : null);

    if (svc) {
      const extracted = AdvpsAPI.extractServiceIdFromPurchaseService(svc);
      if (extracted) {
        return {
          serviceId: extracted,
          advpsOrderId: purchaseOrderId,
          corrected: extracted !== storedServiceId,
          previousServiceId: storedServiceId,
        };
      }
    }

    console.warn(
      `[ADVPS-RESOLVE] No service row on ${purchaseOrderId} (ip=${orderIp || 'n/a'}) — using stored ${storedServiceId}`
    );
  } catch (err) {
    console.warn(`[ADVPS-RESOLVE] getOrderDetails(${purchaseOrderId}) failed:`, err.message);
  }

  return {
    serviceId: storedServiceId,
    advpsOrderId: purchaseOrderId,
    corrected: false,
  };
}

/**
 * Resolve the ADVPS service id used by /api/v1/services/:id/*.
 * Prefers purchase order details over GET /status (status often 404 while renew/power work).
 */
async function resolveAdvpsServiceIdForPower(api, order, { Order } = {}) {
  const stored = String(order?.advpsServiceId || '').trim();
  if (!stored) {
    return { serviceId: '', error: 'No ADVPS service ID attached' };
  }

  const fromPurchase = await resolveAdvpsServiceIdFromPurchase(api, order, stored, { Order });
  if (fromPurchase.advpsOrderId) {
    const out = {
      serviceId: fromPurchase.serviceId,
      advpsOrderId: fromPurchase.advpsOrderId,
    };
    if (fromPurchase.corrected) {
      out.corrected = true;
      out.previousServiceId = fromPurchase.previousServiceId;
    }
    return out;
  }

  const readCanonicalId = (statusRes, fallbackId) => {
    const d = unwrapAdvpsEnvelope(statusRes) || {};
    return String(d.service?.serviceId || d.serviceId || fallbackId).trim() || fallbackId;
  };

  try {
    const statusRes = await api.status(stored);
    return {
      serviceId: readCanonicalId(statusRes, stored),
      statusRes,
    };
  } catch (firstErr) {
    const isNotFound =
      firstErr.status === 404 ||
      /not found|invalid service|not accessible|does not exist/i.test(firstErr.message || '');

    if (!isNotFound) throw firstErr;

    const retry = await resolveAdvpsServiceIdFromPurchase(api, order, stored, { Order });
    if (retry.serviceId) {
      const out = {
        serviceId: retry.serviceId,
        advpsOrderId: retry.advpsOrderId || undefined,
      };
      if (retry.corrected) {
        out.corrected = true;
        out.previousServiceId = retry.previousServiceId;
      }
      return out;
    }

    throw firstErr;
  }
}

function formatAdvpsActionError(error) {
  const msg = error?.message || 'ADVPS action failed';
  if (/IP address not allowed/i.test(msg)) {
    return {
      message: 'ADVPS blocked this request. Whitelist your server public IP in ADVPS API settings.',
      code: 'ADVPS_IP_BLOCKED',
      status: 403,
    };
  }
  if (error?.status === 404 || /not found|invalid service/i.test(msg)) {
    return {
      message: 'ADVPS service not found. Sync the order or contact support to relink the service ID.',
      code: 'ADVPS_SERVICE_NOT_FOUND',
      status: 404,
    };
  }
  if (error?.status === 429) {
    return {
      message: msg,
      code: 'ADVPS_RATE_LIMIT',
      status: 429,
    };
  }
  return { message: msg, code: 'ADVPS_ACTION_FAILED', status: error?.status || 500 };
}

/**
 * POST /api/v1/services/{serviceId}/get-ip — configure VPS IP after power-on.
 * Safe to call when IP is already set; failures are logged but non-fatal.
 */
async function configureAdvpsServiceIp(api, serviceId, { logPrefix = '[ADVPS]' } = {}) {
  try {
    const ipRes = await api.getIp(serviceId);
    const d = unwrapAdvpsEnvelope(ipRes) || ipRes?.data || {};
    const ip = pickAdvpsIp(d, '') || String(d.ip || '').trim();
    console.log(`${logPrefix} get-ip OK service=${serviceId} ip=${ip || '(empty)'}`);
    return { ok: true, ip, response: ipRes };
  } catch (err) {
    console.warn(`${logPrefix} get-ip failed service=${serviceId}: ${err.message}`);
    return { ok: false, ip: '', error: err.message };
  }
}

module.exports = {
  normalizePurchaseOrderDetails,
  pickAdvpsService,
  extractServiceCredentials,
  resolveAdvpsPurchaseOrderId,
  pickAdvpsPurchaseOrderId,
  resolveAdvpsPurchaseOrderIdForService,
  syncAdvpsOrderCredentials,
  resolveAdvpsIdsForRenewal,
  resolveAdvpsServiceIdForPower,
  formatAdvpsActionError,
  configureAdvpsServiceIp,
};
