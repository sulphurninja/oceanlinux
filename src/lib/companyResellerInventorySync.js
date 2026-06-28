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
 * Fetches the full Hostheaven overview once, then matches inventory IPs locally.
 */
async function syncAllInventoryExpiriesFromReseller(company, stockDocs) {
  const updated = [];
  const failed = [];

  const api = createResellerApiClient(company);
  let ipIndex;
  try {
    ipIndex = await api.buildVmIpIndex();
  } catch (err) {
    throw new Error(`Hostheaven overview fetch failed: ${err.message || 'unknown error'}`);
  }

  for (const stock of stockDocs) {
    if (!Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) continue;

    let dirty = false;
    for (const item of stock.inventoryItems) {
      const cleanIp = cleanIpAddress(item.ipAddress);
      if (!cleanIp) continue;

      try {
        const found = ipIndex.get(cleanIp);
        if (!found) {
          throw new Error(`No VM found on Hostheaven for IP ${cleanIp}`);
        }

        let expiryDate = found.expiryDate;
        if (!expiryDate) {
          try {
            const details = await api.getVmDetails(found.vmId);
            expiryDate = ResellerApi.extractVmExpiryDate(found.raw, details);
          } catch {
            // details optional when overview lacks expiry
          }
        }

        if (!expiryDate) {
          throw new Error(`Hostheaven did not return expiry for IP ${cleanIp}`);
        }

        item.expiryDate = expiryDate;
        dirty = true;
        updated.push({
          stockId: String(stock._id),
          itemId: String(item._id),
          ipAddress: item.ipAddress,
          expiryDate,
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

  return { updated, failed, panelExpiriesByIp: Object.fromEntries(
    [...ipIndex.entries()]
      .filter(([, entry]) => entry.expiryDate)
      .map(([ip, entry]) => [ip, entry.expiryDate])
  ) };
}

module.exports = {
  fetchResellerCredentialsByIp,
  fetchResellerExpiryByIp,
  syncAllInventoryExpiriesFromReseller,
};
