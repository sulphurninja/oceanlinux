/**
 * Helpers for resolving a company's Netbay reseller-API config
 * (https://api.netbayhosts.in style — see `services/netbayApi.js`).
 *
 * Mirrors `lib/companyResellerApi.js` but for Netbay. When a company has
 * `netbayApi.enabled = true` but leaves baseUrl blank, we fall back to the
 * documented Netbay base URL. apiKey / apiSecret have no production-safe
 * default — those must be filled in per-company.
 */

const NETBAY_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://api.netbayhosts.in',
});

function getCompanyNetbayApiConfig(company) {
  if (!company) return null;
  const cfg = company.netbayApi;
  if (!cfg) return null;
  if (!cfg.enabled) return null;

  const baseUrl = (cfg.baseUrl || '').trim() || NETBAY_API_DEFAULTS.baseUrl;
  const apiKey = (cfg.apiKey || '').trim();
  const apiSecret = cfg.apiSecret || '';

  if (!baseUrl || !apiKey || !apiSecret) return null;

  return {
    enabled: true,
    label: cfg.label || '',
    baseUrl,
    apiKey,
    apiSecret,
  };
}

function hasCompanyNetbayApi(company) {
  return !!getCompanyNetbayApiConfig(company);
}

module.exports = {
  NETBAY_API_DEFAULTS,
  getCompanyNetbayApiConfig,
  hasCompanyNetbayApi,
};
