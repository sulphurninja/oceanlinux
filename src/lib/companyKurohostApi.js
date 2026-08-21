/**
 * Resolve a company's KuroHost Cloud Platform API config.
 * Docs: https://kurohost.com/cloud/docs/api/authentication
 *
 * Auth: `Authorization: Bearer kuro_<secret>`
 * Base:  https://kurohost.com/api/cloud/v1
 */

const KUROHOST_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://kurohost.com/api/cloud/v1',
});

function getEnvFallback() {
  return {
    baseUrl: (process.env.KUROHOST_API_BASE_URL || '').trim(),
    apiKey: (process.env.KUROHOST_API_KEY || '').trim(),
  };
}

function getCompanyKurohostApiConfig(company) {
  if (!company) return null;
  const cfg = company.kurohostApi;
  if (!cfg?.enabled) return null;

  const env = getEnvFallback();
  const baseUrl = (cfg.baseUrl || '').trim().replace(/\/+$/, '')
    || env.baseUrl
    || KUROHOST_API_DEFAULTS.baseUrl;
  const apiKey = (cfg.apiKey || '').trim() || env.apiKey;

  if (!baseUrl || !apiKey) return null;

  return {
    enabled: true,
    label: cfg.label || '',
    baseUrl,
    apiKey,
    useLiveStockApi: cfg.useLiveStockApi === true,
  };
}

function hasCompanyKurohostApi(company) {
  return !!getCompanyKurohostApiConfig(company);
}

function companyUsesKurohostLiveStock(company) {
  return company?.kurohostApi?.enabled === true;
}

module.exports = {
  KUROHOST_API_DEFAULTS,
  getEnvFallback,
  getCompanyKurohostApiConfig,
  hasCompanyKurohostApi,
  companyUsesKurohostLiveStock,
};
