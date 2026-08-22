/** Parse SmartVPS status payload — handles double-encoded JSON strings. */
function normalizeSmartVpsResponse(payload) {
  if (payload == null) return payload;
  try {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        /* fall through */
      }
      const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
      try {
        return JSON.parse(unquoted);
      } catch {
        /* keep string */
      }
    }
    return payload;
  } catch {
    return payload;
  }
}

function parseSmartVpsStatusObject(raw) {
  let obj = normalizeSmartVpsResponse(raw);
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      try {
        const unquoted = obj.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
        obj = JSON.parse(unquoted);
      } catch {
        obj = {};
      }
    }
  }
  return obj && typeof obj === 'object' ? obj : {};
}

/** SmartVPS status API returns ExpiryDate (sometimes lowercase). */
function parseSmartVpsExpiryDate(source) {
  if (!source) return null;
  const raw =
    source.ExpiryDate ??
    source.expiryDate ??
    source.expiry ??
    source.ExpiresAt ??
    source.expiresAt ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractIpFromAddress(ipAddress) {
  const text = typeof ipAddress === 'string' ? ipAddress : JSON.stringify(ipAddress || '');
  const m = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  return m ? m[0] : null;
}

/**
 * Build Mongo update fields from a SmartVPS status() response.
 * Always prefers panel ExpiryDate when present.
 */
function buildSmartVpsStatusOrderUpdates(order, statusRaw, { updateCreds = true } = {}) {
  const obj = parseSmartVpsStatusObject(statusRaw);

  const username = obj.Usernane || obj.Username || order?.username || null;
  const password = obj.Password || order?.password || null;
  const os = obj.OS || order?.os || undefined;
  const panelExpiry = parseSmartVpsExpiryDate(obj);
  const machineStatus = obj.MachineStatus;
  const powerStatus = obj.PowerStatus;
  const actionStatus = obj.ActionStatus;

  const hasCreds = Boolean(username && password);
  const update = {
    ...(updateCreds && hasCreds ? { username, password } : {}),
    ...(os ? { os } : {}),
    ...(panelExpiry ? { expiryDate: panelExpiry } : {}),
    ...(machineStatus ? { machineStatus } : {}),
    ...(powerStatus ? { powerStatus } : {}),
    ...(actionStatus ? { actionStatus } : {}),
    autoProvisioned: true,
    provisioningError: '',
    lastSyncTime: new Date(),
  };

  if (hasCreds) {
    update.provisioningStatus = 'active';
    update.status = 'active';
  } else if (order) {
    update.provisioningStatus = order.provisioningStatus || 'provisioning';
    update.status = order.status || 'active';
  }

  return {
    update,
    obj,
    hasCreds,
    panelExpiry,
    expirySynced: !!panelExpiry,
    ip: obj.IP || extractIpFromAddress(order?.ipAddress),
  };
}

function resolveSmartVpsOrderIp(order) {
  const fromIp = extractIpFromAddress(order?.ipAddress);
  const fromServiceId = extractIpFromAddress(order?.smartvpsServiceId);
  if (fromIp) return fromIp;
  if (fromServiceId) return fromServiceId;
  const fallback = String(order?.ipAddress || order?.smartvpsServiceId || '').split(':')[0].trim();
  return fallback || null;
}

module.exports = {
  normalizeSmartVpsResponse,
  parseSmartVpsStatusObject,
  parseSmartVpsExpiryDate,
  extractIpFromAddress,
  resolveSmartVpsOrderIp,
  buildSmartVpsStatusOrderUpdates,
};
