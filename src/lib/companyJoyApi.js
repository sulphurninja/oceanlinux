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

/** @type {Map<string, { expires: number, ips: Set<string> }>} */
const joyIpCache = new Map();
const JOY_IP_CACHE_MS = 2 * 60 * 1000;

function getOrderIp(order) {
  return (
    order?.ipAddress ||
    order?.serverDetails?.rawDetails?.ips?.[0] ||
    order?.serviceDetails?.ipAddress ||
    ''
  ).trim();
}

async function joyCompanyHasIp(config, companyId, ip) {
  if (!ip || !config) return false;
  const cacheKey = String(companyId);
  const now = Date.now();
  let entry = joyIpCache.get(cacheKey);
  if (!entry || entry.expires < now) {
    const JoyApi = require('@/services/joyApi');
    const api = new JoyApi(config);
    const machines = await api.machineList();
    entry = {
      expires: now + JOY_IP_CACHE_MS,
      ips: new Set(machines.map((m) => String(m.ip || '').trim()).filter(Boolean)),
    };
    joyIpCache.set(cacheKey, entry);
  }
  return entry.ips.has(ip);
}

/**
 * Resolve Joy API config for an order.
 * 1) ipStock → company (preferred)
 * 2) order IP appears on a Joy-enabled company's machine_list (manage-only join key)
 */
async function resolveJoyApiForOrder(order, { Company, IPStock } = {}) {
  if (!order) return { config: null, companyName: null, matchedBy: null };

  if (order.ipStockId && IPStock && Company) {
    try {
      const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
      if (ipStock?.company) {
        const company = await Company.findById(ipStock.company).select('joyApi name').lean();
        const config = getCompanyJoyApiConfig(company);
        if (config) {
          return { config, companyName: company?.name || null, matchedBy: 'ipStock' };
        }
      }
    } catch (err) {
      console.warn('[companyJoyApi] ipStock Joy lookup failed:', err.message);
    }
  }

  const ip = getOrderIp(order);
  if (!ip || !Company) return { config: null, companyName: null, matchedBy: null };

  try {
    const companies = await Company.find({ 'joyApi.enabled': true }).select('joyApi name').lean();
    for (const company of companies) {
      const config = getCompanyJoyApiConfig(company);
      if (!config) continue;
      try {
        if (await joyCompanyHasIp(config, company._id, ip)) {
          return { config, companyName: company.name || null, matchedBy: 'ip' };
        }
      } catch (err) {
        console.warn(`[companyJoyApi] Joy IP probe failed for ${company.name}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[companyJoyApi] Joy company scan failed:', err.message);
  }

  return { config: null, companyName: null, matchedBy: null };
}

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
  resolveJoyApiForOrder,
};
