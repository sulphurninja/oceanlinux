/**
 * Helpers for resolving a company's Netbay reseller-API config
 * (https://api.netbayhosts.in style — see `services/netbayApi.js`).
 *
 * Mirrors `lib/companyResellerApi.js` but for Netbay. Resolution order for
 * each field (baseUrl / apiKey / apiSecret / couponCode):
 *
 *   1. Company doc (`company.netbayApi.*`)        — admin-set per-company
 *   2. Env vars (`NETBAY_API_BASE_URL`, `NETBAY_API_KEY`,
 *               `NETBAY_API_SECRET`, `NETBAY_COUPON_CODE`) — global fallback
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
    couponCode: (process.env.NETBAY_COUPON_CODE || '').trim(),
  };
}

function getCompanyNetbayApiConfig(company) {
  if (!company) return null;
  const raw = typeof company.toObject === 'function' ? company.toObject() : company;
  const cfg = raw.netbayApi;
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
    couponCode: ((cfg.couponCode || '').trim() || env.couponCode).toUpperCase(),
    couponByMemory: normalizeNetbayCouponByMemory(cfg.couponByMemory),
    couponLinux: String(cfg.couponLinux || '').trim().toUpperCase(),
    couponVps: String(cfg.couponVps || '').trim().toUpperCase(),
    couponProxy: String(cfg.couponProxy || '').trim().toUpperCase(),
  };
}

function normalizeNetbayCouponByMemory(raw) {
  if (!raw) return {};
  const plain = raw instanceof Map ? Object.fromEntries(raw) : raw;
  if (typeof plain !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(plain)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    out[String(key).trim()] = value.trim().toUpperCase();
  }
  return out;
}

function lookupNetbayCouponByMemoryKey(couponByMemory, memory) {
  const byMemory = normalizeNetbayCouponByMemory(couponByMemory);
  const raw = String(memory ?? '').trim();
  if (!raw) return '';

  const gbMatch = raw.match(/(\d+)\s*gb/i);
  const normalizedGb = gbMatch ? `${gbMatch[1]}GB` : null;

  const variants = [
    raw,
    raw.toUpperCase(),
    raw.toLowerCase(),
    raw.replace(/\s+/g, ''),
    normalizedGb,
    normalizedGb?.toLowerCase(),
  ].filter(Boolean);

  for (const key of variants) {
    if (byMemory[key]) return byMemory[key];
  }
  return '';
}

/** Tier-specific coupon only (4GB / 8GB / 16GB / proxy IP range) — no fallback. */
function resolveNetbayTierCoupon(cfg, memory) {
  return lookupNetbayCouponByMemoryKey(cfg?.couponByMemory, memory);
}

function resolveNetbayFallbackCoupon(cfg) {
  return String(cfg?.couponCode || '').trim().toUpperCase();
}

/** Product-kind coupon: `linux`, `vps`, or `proxy` (matches IPStock serverType). */
function resolveNetbayProductKindCoupon(cfg, productKind) {
  const kind = String(productKind || '').trim().toLowerCase();
  if (kind === 'proxy') return String(cfg?.couponProxy || '').trim().toUpperCase();
  if (kind === 'vps') return String(cfg?.couponVps || '').trim().toUpperCase();
  if (kind === 'linux') return String(cfg?.couponLinux || '').trim().toUpperCase();
  return '';
}

/**
 * Coupon to send on a Netbay purchase for one order variant.
 * Returns tier coupon when configured, otherwise product-kind, otherwise fallback.
 */
function resolveNetbayCouponForMemory(cfg, memory, productKind) {
  const tier = resolveNetbayTierCoupon(cfg, memory);
  if (tier) return tier;
  const byKind = resolveNetbayProductKindCoupon(cfg, productKind);
  if (byKind) return byKind;
  return resolveNetbayFallbackCoupon(cfg);
}

/**
 * Ordered coupon attempts for purchase:
 *   1. RAM tier / proxy IP range (couponByMemory)
 *   2. Product kind (Linux / VPS / proxy)
 *   3. Fallback couponCode
 * If a code is rejected upstream, callers should try the next one.
 */
function resolveNetbayCouponAttempts(cfg, memory, productKind) {
  let tier = resolveNetbayTierCoupon(cfg, memory);
  const byKind = resolveNetbayProductKindCoupon(cfg, productKind);
  // Live servers may only send couponByMemory[tier] — treat product-kind coupon as
  // the tier when no RAM-specific override exists (e.g. Linux 2GB before 2GB key added).
  if (!tier && byKind) tier = byKind;
  const fallback = resolveNetbayFallbackCoupon(cfg);
  const attempts = [];
  for (const code of [tier, byKind, fallback]) {
    if (code && !attempts.includes(code)) attempts.push(code);
  }
  return attempts;
}

/**
 * Merge optional per-stock Netbay coupon overrides (manageIpStock) onto company cfg.
 */
function mergeNetbayStockCoupons(companyCfg, stockNetbayRaw = {}) {
  if (!companyCfg) return null;
  const stock = stockNetbayRaw && typeof stockNetbayRaw === 'object' ? stockNetbayRaw : {};
  const stockByMemory = normalizeNetbayCouponByMemory(stock.couponByMemory);
  const mergedByMemory = {
    ...normalizeNetbayCouponByMemory(companyCfg.couponByMemory),
    ...stockByMemory,
  };

  const pick = (stockVal, companyVal) => {
    const s = String(stockVal || '').trim().toUpperCase();
    if (s) return s;
    return String(companyVal || '').trim().toUpperCase();
  };

  return {
    ...companyCfg,
    couponCode: pick(stock.couponCode, companyCfg.couponCode),
    couponLinux: pick(stock.couponLinux, companyCfg.couponLinux),
    couponVps: pick(stock.couponVps, companyCfg.couponVps),
    couponProxy: pick(stock.couponProxy, companyCfg.couponProxy),
    couponByMemory: mergedByMemory,
  };
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
  normalizeNetbayCouponByMemory,
  lookupNetbayCouponByMemoryKey,
  resolveNetbayTierCoupon,
  resolveNetbayProductKindCoupon,
  resolveNetbayFallbackCoupon,
  resolveNetbayCouponForMemory,
  resolveNetbayCouponAttempts,
  mergeNetbayStockCoupons,
};
