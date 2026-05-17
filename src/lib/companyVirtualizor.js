/**
 * Helpers for resolving a company's Virtualizor panels.
 *
 * Companies can configure multiple panels in `virtualizors[]` for fail-over
 * (the order page tries them in order until one returns the target VM).
 * The legacy single-config `virtualizor` field is still read so older
 * documents don't lose their automation when this code ships.
 */

/**
 * Returns the list of Virtualizor accounts for a company that are usable
 * (enabled and have host + apiKey + apiPassword). Order is preserved so the
 * caller controls the fail-over priority.
 *
 * @param {Object} company - Company document (lean or hydrated).
 * @returns {Array<{label: string, host: string, port: number, apiKey: string, apiPassword: string, protocol: 'http'|'https'}>}
 */
function getCompanyVirtualizorAccounts(company) {
  if (!company) return [];
  const out = [];

  if (Array.isArray(company.virtualizors)) {
    for (const v of company.virtualizors) {
      if (!v) continue;
      if (v.enabled === false) continue;
      const host = (v.host || '').trim();
      const apiKey = (v.apiKey || '').trim();
      const apiPassword = v.apiPassword || '';
      if (!host || !apiKey || !apiPassword) continue;
      out.push({
        label: v.label || '',
        host,
        port: Number(v.port || 4083) || 4083,
        apiKey,
        apiPassword,
        protocol: v.protocol === 'http' ? 'http' : 'https',
      });
    }
  }

  // Back-compat: legacy single-config field.
  if (out.length === 0 && company.virtualizor) {
    const v = company.virtualizor;
    const host = (v.host || '').trim();
    const apiKey = (v.apiKey || '').trim();
    const apiPassword = v.apiPassword || '';
    if (v.enabled && host && apiKey && apiPassword) {
      out.push({
        label: 'legacy',
        host,
        port: Number(v.port || 4083) || 4083,
        apiKey,
        apiPassword,
        protocol: v.protocol === 'http' ? 'http' : 'https',
      });
    }
  }

  return out;
}

/**
 * Maps the helper output into the shape `VirtualizorAPI` expects in
 * `new VirtualizorAPI({ accounts: [...] })`.
 */
function toVirtualizorApiAccounts(accounts) {
  return accounts.map(a => ({
    host: a.host,
    port: a.port,
    key: a.apiKey,
    pass: a.apiPassword,
    protocol: a.protocol,
  }));
}

module.exports = { getCompanyVirtualizorAccounts, toVirtualizorApiAccounts };
