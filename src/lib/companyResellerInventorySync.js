const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const {
  normalizeOsForServerType,
  resolveUsernameForOs,
  defaultUsernameForOs,
} = require('@/lib/companyInventory');

function createResellerApiClient(company) {
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    throw new Error('Hostheaven sync is not enabled for this company');
  }
  return new ResellerApi({
    ...cfg,
    label: cfg.label || company?.name || 'reseller',
  });
}

function cleanIpAddress(ipAddress) {
  return String(ipAddress || '').split(':')[0].trim();
}

/**
 * Fetch panel expiry for one IP (overview `expiresAt` + details fallback).
 */
async function fetchResellerExpiryByIp(company, ipAddress) {
  const cleanIp = cleanIpAddress(ipAddress);
  if (!cleanIp) {
    throw new Error('IP address is required');
  }

  const api = createResellerApiClient(company);
  const found = await api.findVmByIp(cleanIp, { skipCache: true });
  if (!found) {
    throw new Error(`No VM found on Hostheaven for IP ${cleanIp}`);
  }

  let details = null;
  try {
    details = await api.getVmDetails(found.vmId);
  } catch {
    // Overview row often has expiresAt — details optional for expiry-only sync.
  }

  const expiryDate = ResellerApi.extractVmExpiryDate(found.raw, details);
  if (!expiryDate) {
    throw new Error(`Hostheaven did not return expiry for IP ${cleanIp}`);
  }

  return {
    ipAddress: found.ip,
    expiryDate,
    vmId: found.vmId,
  };
}

/**
 * Look up a Hostheaven / reseller-panel VM by IP and return login credentials
 * for company pre-configured inventory.
 */
async function fetchResellerCredentialsByIp(company, ipAddress, serverType = 'Linux') {
  const cleanIp = cleanIpAddress(ipAddress);
  if (!cleanIp) {
    throw new Error('IP address is required');
  }

  const api = createResellerApiClient(company);
  const found = await api.findVmByIp(cleanIp, { skipCache: true });
  if (!found) {
    throw new Error(`No VM found on Hostheaven for IP ${cleanIp}`);
  }

  const details = await api.getVmDetails(found.vmId);
  const password = ResellerApi.extractVmPassword(details);
  if (!password) {
    throw new Error('Hostheaven did not return a password for this VM');
  }

  const osRaw =
    ResellerApi.extractVmOs(details) ||
    found.raw?.os ||
    found.raw?.operatingSystem ||
    found.raw?.templateName ||
    '';

  const os = normalizeOsForServerType(osRaw, serverType);
  const username = resolveUsernameForOs(
    ResellerApi.extractVmUsername(details) || defaultUsernameForOs(os),
    os
  );

  return {
    ipAddress: found.ip,
    username,
    password,
    os,
    vmId: found.vmId,
    serverName: found.serverName || '',
    expiryDate: ResellerApi.extractVmExpiryDate(found.raw, details),
  };
}

/**
 * Refresh panel expiry on every inventory row (old + new) from Hostheaven by IP.
 */
async function syncAllInventoryExpiriesFromReseller(company, stockDocs) {
  const updated = [];
  const failed = [];

  for (const stock of stockDocs) {
    if (!Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) continue;

    let dirty = false;
    for (const item of stock.inventoryItems) {
      if (!item.ipAddress) continue;
      try {
        const result = await fetchResellerExpiryByIp(company, item.ipAddress);
        item.expiryDate = result.expiryDate;
        dirty = true;
        updated.push({
          stockId: String(stock._id),
          itemId: String(item._id),
          ipAddress: item.ipAddress,
          expiryDate: result.expiryDate,
        });
      } catch (err) {
        failed.push({
          stockId: String(stock._id),
          itemId: String(item._id),
          ipAddress: item.ipAddress,
          error: err.message || 'Sync failed',
        });
      }
    }

    if (dirty) {
      await stock.save();
    }
  }

  return { updated, failed };
}

module.exports = {
  fetchResellerCredentialsByIp,
  fetchResellerExpiryByIp,
  syncAllInventoryExpiriesFromReseller,
};
