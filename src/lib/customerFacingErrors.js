const GENERIC_SERVICE_ERROR =
  'Something went wrong. Please try again in a few minutes or contact support if the problem continues.';

const GENERIC_PROVISIONING_ERROR =
  'Your server is still being set up. If this takes longer than expected, please contact support.';

const ACTION_MESSAGES = {
  rebuild: 'We could not reinstall your server right now. Please try again later or contact support.',
  reinstall: 'We could not reinstall your server right now. Please try again later or contact support.',
  format: 'We could not format your server right now. Please try again later or contact support.',
  start: 'Could not start your server. Please try again or contact support.',
  stop: 'Could not stop your server. Please try again or contact support.',
  restart: 'Could not restart your server. Please try again or contact support.',
  reboot: 'Could not reboot your server. Please try again or contact support.',
  resetmac: 'Could not reset the MAC address. Please try again later.',
  changepassword: 'Could not update the password. Please try again or contact support.',
  generatepassword: 'Could not generate a new password. Try Format Server or contact support.',
  sync: 'Could not refresh server details right now. Please try again.',
  templates: 'Could not load operating systems. Please try again.',
  status: 'Could not check server status. Please try again.',
  provision: GENERIC_PROVISIONING_ERROR,
};

const ALLOWED_CUSTOMER_PATTERNS = [
  /rebuild limit/i,
  /reinstalls? every 24 hours/i,
  /3 times every 24 hours/i,
  /MAC reset is only allowed/i,
  /still being set up/i,
  /try again in a minute/i,
  /try again shortly/i,
  /contact support/i,
  /Format Server/i,
  /Password.*already/i,
  /not available for this plan/i,
  /not supported for this server/i,
  /session expired/i,
  /log in again/i,
  /payment not completed/i,
  /out of stock/i,
  /Too many requests/i,
];

/** Never show raw provider/API details to customers. */
const TECHNICAL_MESSAGE_RE =
  /ADVPS|SmartVPS|Netbay|Hostheaven|Hostycare|primevm|primevps|reseller-api|Virtualizor|Joy panel|VIRTUALIZOR|ActionStatus|MachineStatus|changeos|osid|panel\(s\)|connectivity issue|\/api\/v1|\/api\/|hostycareProductId|serviceId|templateId|x-api-key|sk_test_|ECONNREFUSED|fetch error|network error|HTTP \d{3}|failed:|whitelist.*IP|available order fields|IPStock|Lock acquisition|"stack"|\\u003c|\bPOST\b|\bGET\b|\bPUT\b|\bDELETE\b|Restart failed:/i;

function stripProviderBranding(text) {
  return String(text || '')
    .replace(/\bADVPS\b/gi, 'server panel')
    .replace(/\bSmartVPS\b/gi, 'server panel')
    .replace(/\bNetbay\b/gi, 'server panel')
    .replace(/\bHostheaven\b/gi, 'server panel')
    .replace(/\bHostycare\b/gi, 'server panel')
    .replace(/\bVirtualizor\b/gi, 'server panel')
    .replace(/\bReseller API\b/gi, 'server panel')
    .trim();
}

function isAllowedCustomerMessage(message) {
  return ALLOWED_CUSTOMER_PATTERNS.some((re) => re.test(message));
}

function isTechnicalCustomerMessage(message) {
  if (!message || typeof message !== 'string') return true;
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (isAllowedCustomerMessage(trimmed)) return false;
  return TECHNICAL_MESSAGE_RE.test(trimmed);
}

function messageForCode(code, raw) {
  switch (code) {
    case 'NETBAY_REBUILD_LIMIT':
    case 'ADVPS_REBUILD_LIMIT':
      return (
        stripProviderBranding(raw) ||
        'Reinstall limit reached. You can reinstall up to 3 times every 24 hours.'
      );
    case 'ADVPS_IP_BLOCKED':
      return 'This action is temporarily unavailable. Please contact support for help.';
    case 'MAC_RESET_RATE_LIMIT':
      return 'MAC reset is only allowed once every 24 hours.';
    case 'MAC_RESET_NOT_APPLICABLE':
      return 'MAC reset is not available for this server.';
    case 'PASSWORD_ALREADY_EXISTS':
      return 'Use Format Server to get a new password.';
    case 'ADVPS_SERVICE_NOT_FOUND':
    case 'VIRTUALIZOR_VPS_NOT_FOUND':
      return 'Server details could not be found. Please contact support.';
    case 'SMARTVPS_BUSY':
      return 'Your server is still processing a previous action. Please wait a few minutes and try again.';
    default:
      return null;
  }
}

/**
 * Map any VPS/server action error to a safe customer-facing string.
 */
function customerServiceErrorMessage(raw, { action, code } = {}) {
  const byCode = messageForCode(code, raw);
  if (byCode) return byCode;

  if (raw && typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed && !isTechnicalCustomerMessage(trimmed)) {
      return stripProviderBranding(trimmed);
    }
  }

  const actionKey = String(action || '')
    .toLowerCase()
    .replace(/reset-mac/, 'resetmac');
  return ACTION_MESSAGES[actionKey] || GENERIC_SERVICE_ERROR;
}

function customerProvisioningErrorMessage(raw) {
  if (!raw || typeof raw !== 'string') return GENERIC_PROVISIONING_ERROR;
  const trimmed = raw.trim();
  if (!trimmed) return GENERIC_PROVISIONING_ERROR;
  if (/CONFIG:|hostycareProductId|Memory configuration/i.test(trimmed)) {
    return 'Your order is being configured. Please contact support if this takes too long.';
  }
  if (isTechnicalCustomerMessage(trimmed)) return GENERIC_PROVISIONING_ERROR;
  return stripProviderBranding(trimmed);
}

function shouldSanitizeCustomerMessage(payload, fieldValue) {
  if (typeof fieldValue !== 'string' || !fieldValue.trim()) return false;
  if (payload?.success === false) return true;
  if (payload?.synced === false) return true;
  if (payload?.ok === false) return true;
  if (typeof payload?.error === 'string' && payload.error.trim()) return true;
  return isTechnicalCustomerMessage(fieldValue);
}

function sanitizeCustomerApiPayload(payload, { action } = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  const code = out.code;

  if (typeof out.error === 'string') {
    out.error = customerServiceErrorMessage(out.error, { action, code });
  }
  if (typeof out.message === 'string') {
    if (out.success === false || out.synced === false || out.ok === false) {
      out.message = customerServiceErrorMessage(out.message, { action, code });
    } else if (shouldSanitizeCustomerMessage(out, out.message)) {
      out.message = customerServiceErrorMessage(out.message, { action, code });
    }
  }
  if (out.result && typeof out.result === 'object') {
    const result = { ...out.result };
    const resultLooksFailed = result.synced === false || result.success === false;
    if (typeof result.message === 'string' && (resultLooksFailed || shouldSanitizeCustomerMessage(result, result.message))) {
      result.message = customerServiceErrorMessage(result.message, { action, code });
    }
    if (typeof result.error === 'string') {
      result.error = customerServiceErrorMessage(result.error, { action, code });
    }
    out.result = result;
  }
  if (out.syncResult && typeof out.syncResult === 'object') {
    const syncResult = { ...out.syncResult };
    if (syncResult.syncFailed && typeof syncResult.error === 'string') {
      syncResult.error = customerServiceErrorMessage(syncResult.error, { action, code });
    }
    out.syncResult = syncResult;
  }
  return out;
}

const GENERIC_API_ERROR =
  'Something went wrong. Please try again or contact support.';

function customerApiCatchPayload(raw, { action } = {}) {
  const message = customerServiceErrorMessage(raw, { action });
  return { success: false, message, error: message };
}

function customerSuccessMessage(raw, fallback = 'Action completed successfully.') {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return stripProviderBranding(trimmed);
}

function sanitizeOrdersForCustomer(orders, { isAdmin = false } = {}) {
  if (!Array.isArray(orders) || isAdmin) return orders;
  return orders.map((order) => sanitizeOrderForCustomer(order, { isAdmin }));
}

function sanitizeOrderForCustomer(order, { isAdmin = false } = {}) {
  if (!order || isAdmin) return order;
  const safe = { ...order };
  if (safe.provisioningError) {
    safe.provisioningError = customerProvisioningErrorMessage(safe.provisioningError);
  }
  return safe;
}

module.exports = {
  GENERIC_SERVICE_ERROR,
  GENERIC_PROVISIONING_ERROR,
  GENERIC_API_ERROR,
  customerServiceErrorMessage,
  customerProvisioningErrorMessage,
  customerApiCatchPayload,
  customerSuccessMessage,
  sanitizeCustomerApiPayload,
  sanitizeOrderForCustomer,
  sanitizeOrdersForCustomer,
  isTechnicalCustomerMessage,
};
