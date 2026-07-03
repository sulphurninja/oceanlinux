/**
 * Helpers for resolving a company's Joy Services instances-API config
 * (https://docs.joy.services/instance-api/ — see `services/joyApi.js`).
 *
 * Mirrors `lib/companyNetbayApi.js`. Resolution order for each field
 * (baseUrl / apiToken / apiKey):
 *
 *   1. Company doc (`company.joyApi.*`)               — admin-set per-company
 *   2. Env vars (`JOY_API_BASE_URL`, `JOY_API_TOKEN`,
 *               `JOY_API_KEY`)                        — global fallback
 *   3. Hardcoded default base URL                     — last resort for baseUrl only
 *
 * Joy is a MANAGE-ONLY provider (no buy/provision API), so this config only
 * gates power-management + status of already-existing machines.
 */

const JOY_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://api.joy.services',
});

function getEnvFallback() {
  return {
    baseUrl: (process.env.JOY_API_BASE_URL || '').trim(),
    apiToken: (process.env.JOY_API_TOKEN || '').trim(),
    apiKey: process.env.JOY_API_KEY || '',
  };
}

function getCompanyJoyApiConfig(company) {
  if (!company) return null;
  const cfg = company.joyApi;
  if (!cfg) return null;
  if (!cfg.enabled) return null;

  const env = getEnvFallback();
  const baseUrl = (cfg.baseUrl || '').trim() || env.baseUrl || JOY_API_DEFAULTS.baseUrl;
  const apiToken = (cfg.apiToken || '').trim() || env.apiToken;
  const apiKey = (cfg.apiKey || '').trim() || env.apiKey;

  if (!baseUrl || !apiToken || !apiKey) return null;

  return {
    enabled: true,
    label: cfg.label || '',
    baseUrl,
    apiToken,
    apiKey,
  };
}

function hasCompanyJoyApi(company) {
  return !!getCompanyJoyApiConfig(company);
}

module.exports = {
  JOY_API_DEFAULTS,
  getEnvFallback,
  getCompanyJoyApiConfig,
  hasCompanyJoyApi,
};
