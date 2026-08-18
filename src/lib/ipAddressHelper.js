/**
 * Customer-facing IP formatting (Hostycare Windows :49965, Netbay Windows :5517).
 * Management/API calls should use extractBaseIp() — never send display ports upstream.
 */

export const HOSTYCARE_WINDOWS_PORT = 49965;
export const NETBAY_DISPLAY_PORT = 5517;

function isWindowsOs(os) {
  return os && String(os).toLowerCase().includes('windows');
}

export function formatIpAddress(ipAddress, provider, os) {
  if (!ipAddress || ipAddress === 'Pending - Server being provisioned') {
    return ipAddress;
  }

  const prov = String(provider || '').toLowerCase();

  if (prov === 'netbay') {
    const base = extractBaseIp(ipAddress);
    if (!base) return ipAddress;
    if (!isWindowsOs(os)) return base;
    return `${base}:${NETBAY_DISPLAY_PORT}`;
  }

  const isHostycare = prov === 'hostycare' || !provider;

  if (isHostycare && isWindowsOs(os)) {
    const base = extractBaseIp(ipAddress);
    if (!base) return ipAddress;
    return `${base}:${HOSTYCARE_WINDOWS_PORT}`;
  }

  return ipAddress;
}

/**
 * Strip display port — use before Netbay/Hostycare/SmartVPS API or reachability checks.
 */
export function extractBaseIp(ipAddress) {
  if (!ipAddress) return ipAddress;

  const colonIndex = ipAddress.indexOf(':');
  if (colonIndex > -1) {
    return ipAddress.substring(0, colonIndex);
  }

  return ipAddress;
}

export function needsPort49965(order) {
  const isHostycare = order.provider === 'hostycare' || !order.provider;
  return isHostycare && isWindowsOs(order?.os);
}

export function needsPort5517(order) {
  const isNetbay = order?.provider === 'netbay' || !!order?.netbayServiceId;
  return isNetbay && isWindowsOs(order?.os);
}

export function formatIpForOrder(order, ipAddress) {
  if (!ipAddress) return ipAddress;
  if (needsPort5517(order)) {
    return formatIpAddress(ipAddress, 'netbay', order?.os);
  }
  return formatIpAddress(ipAddress, order?.provider || 'hostycare', order?.os);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HOSTYCARE_WINDOWS_PORT,
    NETBAY_DISPLAY_PORT,
    formatIpAddress,
    extractBaseIp,
    needsPort49965,
    needsPort5517,
    formatIpForOrder,
  };
}
