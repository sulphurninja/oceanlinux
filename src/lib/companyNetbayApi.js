/**
 * Helpers for resolving a company's Netbay reseller-API config
 * (https://api.netbayhosts.in style — see `services/netbayApi.js`).
 *
 * Mirrors `lib/companyResellerApi.js` but for Netbay. Resolution order for
 * each field (baseUrl / apiKey / apiSecret):
 *
 *   1. Company doc (`company.netbayApi.*`)        — admin-set per-company
 *   2. Env vars (`NETBAY_API_BASE_URL`,
 *               `NETBAY_API_KEY`, `NETBAY_API_SECRET`) — global fallback
 *   3. Hardcoded default base URL                  — last resort for baseUrl only
 *
 * This means an admin can either:
 *   - Drop one shared key into .env and just toggle Enabled per company, or
 *   - Save per-company credentials in /admin/companies (which override env).
 *
 * Keeping them admin-overridable matches the Hostheaven pattern in
 * `lib/companyResellerApi.js`.
 */

const NETBAY_API_DEFAULTS = Object.freeze({
  baseUrl: 'https://api.netbayhosts.in',
});

function getEnvFallback() {
  return {
    baseUrl: (process.env.NETBAY_API_BASE_URL || '').trim(),
    apiKey: (process.env.NETBAY_API_KEY || '').trim(),
    apiSecret: process.env.NETBAY_API_SECRET || '',
  };
}

function getCompanyNetbayApiConfig(company) {
  if (!company) return null;
  const cfg = company.netbayApi;
  if (!cfg) return null;
  if (!cfg.enabled) return null;

  const env = getEnvFallback();
  const baseUrl = (cfg.baseUrl || '').trim() || env.baseUrl || NETBAY_API_DEFAULTS.baseUrl;
  const apiKey = (cfg.apiKey || '').trim() || env.apiKey;
  const apiSecret = cfg.apiSecret || env.apiSecret;

  if (!baseUrl || !apiKey || !apiSecret) return null;

  return {
    enabled: true,
    label: cfg.label || '',
    baseUrl,
    apiKey,
    apiSecret,
    couponCode: String(cfg.couponCode || '').trim().toUpperCase(),
    couponByMemory: normalizeNetbayCouponByMemory(cfg.couponByMemory),
  };
}

function normalizeNetbayCouponByMemory(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const plain = raw instanceof Map ? Object.fromEntries(raw) : raw;
  const out = {};
  for (const [key, value] of Object.entries(plain)) {
    if (typeof value === 'string' && value.trim()) {
      out[String(key).trim()] = value.trim().toUpperCase();
    }
  }
  return out;
}

function parseMemoryGb(memory) {
  const m = String(memory || '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * RAM-specific coupon first (4GB / 8GB / 16GB), then company fallback coupon.
 * Does not reuse another RAM's code when only one tier is filled.
 */
function resolveNetbayCouponForMemory(cfg, memory) {
  if (!cfg) return '';
  const byMem = normalizeNetbayCouponByMemory(cfg.couponByMemory);
  const gb = parseMemoryGb(memory);

  if (gb != null) {
    const exact = byMem[`${gb}GB`] || byMem[`${gb}gb`] || byMem[`${gb} GB`];
    if (exact) return String(exact).trim().toUpperCase();

    for (const [key, value] of Object.entries(byMem)) {
      if (parseMemoryGb(key) === gb && value) return String(value).trim().toUpperCase();
    }
  }

  return String(cfg.couponCode || '').trim().toUpperCase();
}

function hasCompanyNetbayApi(company) {
  return !!getCompanyNetbayApiConfig(company);
}

/** True when Netbay plans should sync availability from GET /services/stock. */
function companyUsesNetbayLiveStock(company) {
  if (!company?.netbayApi?.enabled) return false;
  return company.netbayApi.useLiveStockApi === true;
}

module.exports = {
  NETBAY_API_DEFAULTS,
  getEnvFallback,
  getCompanyNetbayApiConfig,
  hasCompanyNetbayApi,
  companyUsesNetbayLiveStock,
  resolveNetbayCouponForMemory,
};
