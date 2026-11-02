const {
  parseSmartVpsStatusObject,
  parseSmartVpsExpiryDate,
  extractIpFromAddress,
} = require('./smartvpsOrderSync');

const MISSING_MESSAGE =
  'This server is no longer on the provider panel, so renewal cannot continue. Please contact support.';
const VERIFY_MESSAGE =
  'Could not verify this server on the provider right now. Please try again in a minute. You have not been charged.';

function orderIp(order) {
  return (
    extractIpFromAddress(order?.ipAddress) ||
    extractIpFromAddress(order?.smartvpsServiceId) ||
    ''
  );
}

/** True only when a SmartVPS status payload still describes a live server. */
function smartVpsStatusShowsServer(raw) {
  const obj = parseSmartVpsStatusObject(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    if (typeof raw === 'string') {
      const lower = raw.toLowerCase();
      if (/(not found|no vps|invalid|does not exist|deleted|no server|no record)/.test(lower)) return false;
    }
    return false;
  }

  const hasMachine = Boolean(
    parseSmartVpsExpiryDate(obj) ||
    obj.MachineStatus ||
    obj.PowerStatus ||
    obj.Username ||
    obj.Usernane ||
    obj.IP ||
    obj.Ip ||
    obj.ip
  );
  if (hasMachine) return true;

  if (obj.success === false) return false;
  if (typeof obj.error === 'string' && obj.error.trim()) return false;
  const message = String(obj.message || obj.Message || '').toLowerCase();
  if (/(not found|no vps|invalid|does not exist|deleted|no server)/.test(message)) return false;
  return false;
}

async function checkSmartVpsPresence(order) {
  const ip = orderIp(order);
  if (!ip) {
    return { ok: false, code: 'ip_missing', message: MISSING_MESSAGE };
  }
  try {
    const SmartVpsAPI = require('../services/smartvpsApi');
    const raw = await new SmartVpsAPI().status(ip);
    if (!smartVpsStatusShowsServer(raw)) {
      return { ok: false, code: 'ip_missing', message: MISSING_MESSAGE };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[RENEWAL-PRESENCE] SmartVPS status check failed:', err.message);
    return { ok: false, code: 'verify_failed', message: VERIFY_MESSAGE };
  }
}

async function resellerIpOnPanel(api, ip, order = null) {
  const ResellerApi = require('../services/resellerApi');
  const cleanIp = String(ip || '').split(':')[0].trim();
  if (!cleanIp) return { found: false, complete: true };

  const savedVmId = order?.resellerVmId ? String(order.resellerVmId).trim() : '';
  if (savedVmId) {
    try {
      const details = await api.getVmDetails(savedVmId);
      const detailIp = String(details?.ipAddress || details?.ip || '').split(':')[0].trim();
      if (details && (!detailIp || detailIp === cleanIp)) {
        return { found: true, complete: true };
      }
    } catch (_) {
      /* vm id stale — fall through to IP index */
    }
  }

  try {
    const found = await api.findVmByIp(cleanIp, { maxPages: 500, pageSize: 100, skipCache: true });
    if (found?.vmId) return { found: true, complete: true };
  } catch (err) {
    console.warn('[RENEWAL-PRESENCE] findVmByIp failed:', err.message);
    return { found: false, complete: false };
  }

  return { found: false, complete: true };
}

async function checkResellerPanelPresence(order) {
  const ip = orderIp(order);
  if (!ip) {
    return { ok: false, code: 'ip_missing', message: MISSING_MESSAGE };
  }
  try {
    const { resolveResellerApiForOrder } = require('./resellerPanelRenewal');
    const { api, error } = await resolveResellerApiForOrder(order);
    if (!api) {
      console.warn('[RENEWAL-PRESENCE] Reseller panel unavailable:', error);
      return { ok: false, code: 'verify_failed', message: VERIFY_MESSAGE };
    }
    const found = await resellerIpOnPanel(api, ip, order);
    if (found.found) return { ok: true };
    if (!found.complete) {
      return { ok: false, code: 'verify_failed', message: VERIFY_MESSAGE };
    }
    return { ok: false, code: 'ip_missing', message: MISSING_MESSAGE };
  } catch (err) {
    console.warn('[RENEWAL-PRESENCE] Reseller panel lookup failed:', err.message);
    return { ok: false, code: 'verify_failed', message: VERIFY_MESSAGE };
  }
}

/**
 * Before taking renewal payment, confirm the IP still exists on SmartVPS
 * or the reseller company panel. Other providers are unchanged.
 */
async function checkRenewalPanelPresence(order, provider) {
  if (provider === 'smartvps') return checkSmartVpsPresence(order);
  if (provider === 'reseller-api') return checkResellerPanelPresence(order);
  return { ok: true };
}

module.exports = {
  smartVpsStatusShowsServer,
  checkRenewalPanelPresence,
  MISSING_MESSAGE,
  VERIFY_MESSAGE,
};
