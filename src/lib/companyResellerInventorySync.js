const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const {
  normalizeOsForServerType,
  resolveUsernameForOs,
  defaultUsernameForOs,
} = require('@/lib/companyInventory');

/**
 * Look up a Hostheaven / reseller-panel VM by IP and return login credentials
 * for company pre-configured inventory.
 */
async function fetchResellerCredentialsByIp(company, ipAddress, serverType = 'Linux') {
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    throw new Error('Hostheaven sync is not enabled for this company');
  }

  const cleanIp = String(ipAddress || '').split(':')[0].trim();
  if (!cleanIp) {
    throw new Error('IP address is required');
  }

  const api = new ResellerApi({
    ...cfg,
    label: cfg.label || company?.name || 'reseller',
  });

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
  };
}

module.exports = {
  fetchResellerCredentialsByIp,
};
