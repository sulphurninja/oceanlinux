/**
 * Per-IPStock configuration for PrimeVPS / Hostheaven-style panel buy + renew.
 *
 * Stored under ipStock.defaultConfigurations.resellerApi:
 * {
 *   zoneId: 1,
 *   zoneIds: [1, 19],
 *   zoneNames: { "1": "Mumbai", "19": "160.191-3rd Server" },
 *   planType: "SHARED",
 *   gateway: "WALLET",
 *   priceByMemory: {
 *     "4GB": { cpuPriceId, ramPriceId, diskPriceId, bandwidthPriceId, zoneIsoId? }
 *   },
 *   defaultOs: { Linux: { zoneIsoId: 4 }, Windows: { zoneIsoId: 2 } },
 *   couponCode: "OCEAN199",
 *   couponByMemory: { "4GB": "OCEAN199", "8GB": "WINPROMO" }
 * }
 */

const { toPlainConfigurations } = require('@/lib/advpsLiveStock');
const ResellerApi = require('@/services/resellerApi');

function normalizeResellerZoneIds(cfg = {}) {
  const ids = [];
  const push = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || ids.includes(n)) return;
    ids.push(n);
  };

  if (Array.isArray(cfg.zoneIds)) {
    for (const value of cfg.zoneIds) push(value);
  }
  if (cfg.zoneId != null) {
    const primary = Number(cfg.zoneId);
    if (Number.isFinite(primary)) {
      const withoutPrimary = ids.filter((id) => id !== primary);
      return [primary, ...withoutPrimary];
    }
  }
  return ids;
}

function readResellerApiStockConfig(ipStock) {
  const plain = toPlainConfigurations(ipStock?.defaultConfigurations);
  const cfg = plain?.resellerApi || {};

  const priceByMemory = cfg.priceByMemory instanceof Map
    ? Object.fromEntries(cfg.priceByMemory)
    : (cfg.priceByMemory || {});

  const defaultOs = cfg.defaultOs instanceof Map
    ? Object.fromEntries(cfg.defaultOs)
    : (cfg.defaultOs || {});

  const couponByMemory = cfg.couponByMemory instanceof Map
    ? Object.fromEntries(cfg.couponByMemory)
    : (cfg.couponByMemory && typeof cfg.couponByMemory === 'object' ? cfg.couponByMemory : {});

  const zoneIds = normalizeResellerZoneIds(cfg);
  const zoneNames =
    cfg.zoneNames instanceof Map
      ? Object.fromEntries(cfg.zoneNames)
      : (cfg.zoneNames && typeof cfg.zoneNames === 'object' ? cfg.zoneNames : {});

  return {
    zoneId: zoneIds[0] ?? (cfg.zoneId != null ? Number(cfg.zoneId) : null),
    zoneIds,
    zoneNames,
    planType: String(cfg.planType || 'SHARED').toUpperCase(),
    gateway: String(cfg.gateway || 'WALLET').toUpperCase(),
    priceByMemory,
    defaultOs,
    couponCode: String(cfg.couponCode || '').trim(),
    couponByMemory,
  };
}

function normalizeCouponByMemory(raw) {
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

function normalizeCompanyCouponConfig(raw) {
  if (typeof raw === 'string') {
    return { couponCode: raw.trim().toUpperCase(), couponByMemory: {} };
  }
  if (!raw || typeof raw !== 'object') {
    return { couponCode: '', couponByMemory: {} };
  }
  return {
    couponCode: String(raw.couponCode || '').trim().toUpperCase(),
    couponByMemory: normalizeCouponByMemory(raw.couponByMemory),
  };
}

/** Hostheaven / panel upstream coupon for auto-buy (not OceanLinux customer promos). */
function resolveCouponCodeForMemory(stockCfg, memory, companyCoupon = '') {
  const company = normalizeCompanyCouponConfig(companyCoupon);

  const fromStockMemory = resolveMemoryConfigEntry(stockCfg?.couponByMemory, memory);
  if (typeof fromStockMemory === 'string' && fromStockMemory.trim()) return fromStockMemory.trim().toUpperCase();
  if (fromStockMemory && typeof fromStockMemory === 'object' && fromStockMemory.code) {
    return String(fromStockMemory.code).trim().toUpperCase();
  }

  const stockCode = String(stockCfg?.couponCode || '').trim().toUpperCase();
  if (stockCode) return stockCode;

  const fromCompanyMemory = resolveMemoryConfigEntry(company.couponByMemory, memory);
  if (typeof fromCompanyMemory === 'string' && fromCompanyMemory.trim()) {
    return fromCompanyMemory.trim().toUpperCase();
  }

  return company.couponCode;
}

function resolveExpectedZoneIds(ipStock) {
  const cfg = readResellerApiStockConfig(ipStock);
  return cfg.zoneIds.length ? cfg.zoneIds : (cfg.zoneId != null ? [cfg.zoneId] : []);
}

/**
 * Ordered live zones for auto-buy — primary first, then fallback when inactive.
 */
async function resolveResellerZoneCandidatesForPurchase(api, stockCfg, { zonesList = null } = {}) {
  const configured = stockCfg?.zoneIds?.length
    ? stockCfg.zoneIds
    : stockCfg?.zoneId != null
      ? [Number(stockCfg.zoneId)]
      : [];

  const zones = zonesList || (await api.listZones());

  if (!configured.length) {
    const active = zones.find((z) => ResellerApi.isZoneStatusLive(z.status)) || zones[0];
    return active
      ? [{ zoneId: Number(active.id), zone: active, live: ResellerApi.isZoneStatusLive(active.status) }]
      : [];
  }

  const candidates = [];
  for (const id of configured) {
    const zone = zones.find((z) => Number(z.id) === Number(id));
    if (!zone || !ResellerApi.isZoneStatusLive(zone.status)) continue;
    candidates.push({ zoneId: Number(id), zone, live: true });
  }
  return candidates;
}

function parseMemoryGb(memory) {
  const m = String(memory || '').match(/(\d+)/);
  return m ? Number(m[1]) : 4;
}

function resolveMemoryConfigEntry(map, memory) {
  if (!map || typeof map !== 'object') return null;
  const variations = [
    memory,
    String(memory || '').toLowerCase(),
    String(memory || '').toUpperCase(),
    String(memory || '').replace(/\s+/g, ''),
  ].filter(Boolean);

  for (const key of variations) {
    const hit = map[key];
    if (hit != null && hit !== '') return hit;
  }

  const entries = Object.entries(map).filter(([, v]) => v != null && v !== '');
  if (entries.length === 1) return entries[0][1];
  return null;
}

function resolvePriceIdsForMemory(stockCfg, memory) {
  if (!stockCfg?.priceByMemory) return null;
  const hit = resolveMemoryConfigEntry(stockCfg.priceByMemory, memory);
  return hit && typeof hit === 'object' ? hit : null;
}

/**
 * Best-effort ISO pick from a zone catalog for the order OS family.
 */
function resolveZoneIsoIdFromCatalog(isos, { isWindows, orderOs } = {}) {
  const list = Array.isArray(isos) ? isos : (isos?.isos || []);
  if (!list.length) return null;

  const os = String(orderOs || '').toLowerCase();
  const pick = (pred) => list.find(pred);
  const isoName = (i) => String(i.name || i.isoName || '');
  const isoType = (i) => String(i.osType || '').toUpperCase();

  if (isWindows || os.includes('windows')) {
    return (
      pick((i) => /windows.*2022|2022.*windows/i.test(isoName(i))) ||
      pick((i) => isoType(i).includes('WINDOWS'))
    )?.id ?? null;
  }
  if (os.includes('centos')) {
    return pick((i) => /centos/i.test(isoName(i)))?.id ?? null;
  }
  if (os.includes('24')) {
    return (
      pick((i) => /ubuntu\s*24|ubuntu24/i.test(isoName(i))) ||
      pick((i) => isoType(i) === 'UBUNTU' && /24/.test(isoName(i)))
    )?.id ?? null;
  }
  // Ubuntu 22 — do NOT match bare "22" (false match on "Windows 2022")
  return (
    pick((i) => /ubuntu\s*22|ubuntu22/i.test(isoName(i))) ||
    pick((i) => isoType(i) === 'UBUNTU')
  )?.id ?? null;
}

/**
 * When admin hasn't mapped price IDs, derive them from the live pricing catalog.
 */
function labelGbFromCatalogEntry(entry) {
  const m = String(entry?.label || '').match(/(\d+)\s*GB/i);
  return m ? Number(m[1]) : 0;
}

function findRamEntryForGb(ramList, gb) {
  if (!Array.isArray(ramList) || !ramList.length) return null;

  const exactMb = ramList.find((x) => Number(x.ramMb) === gb * 1024);
  if (exactMb) return exactMb;

  const byLabel = ramList.find((x) => labelGbFromCatalogEntry(x) === gb);
  if (byLabel) return byLabel;

  const sorted = ramList.slice().sort((a, b) => Number(a.ramMb || 0) - Number(b.ramMb || 0));
  return (
    sorted.find((x) => labelGbFromCatalogEntry(x) >= gb) ||
    sorted.find((x) => Number(x.ramMb || 0) >= gb * 1000) ||
    null
  );
}

async function resolvePriceIdsFromPlanCatalog(api, { gb, planType }) {
  const pt = String(planType || 'SHARED').toUpperCase();
  const [cpuList, ramList, diskList, bwList] = await Promise.all([
    api.getPricingCatalog(pt, 'cpu'),
    api.getPricingCatalog(pt, 'ram'),
    api.getPricingCatalog(pt, 'disk'),
    api.getPricingCatalog(pt, 'bandwidth'),
  ]);

  const ramEntry = findRamEntryForGb(ramList, gb);
  if (!ramEntry?.id) return null;

  const targetCores = Math.max(1, Math.min(8, Math.ceil(gb / 2)));
  const cpuEntry =
    cpuList.find((x) => Number(x.cores) === targetCores) ||
    cpuList.find((x) => Number(x.cores) >= targetCores) ||
    cpuList
      .slice()
      .sort((a, b) => Number(a.cores || 0) - Number(b.cores || 0))
      .find((x) => Number(x.cores || 0) >= targetCores) ||
    cpuList[0];

  const diskEntry = diskList[0];
  const bwEntry = bwList[0];

  if (!cpuEntry?.id || !diskEntry?.id || !bwEntry?.id) return null;

  return {
    planType: pt,
    cpuPriceId: cpuEntry.id,
    ramPriceId: ramEntry.id,
    diskPriceId: diskEntry.id,
    bandwidthPriceId: bwEntry.id,
    resolvedRamMb: ramEntry.ramMb,
    resolvedRamLabel: ramEntry.label,
  };
}

async function autoResolveResellerPriceIds(api, { memory, planType = 'SHARED' }) {
  const gb = parseMemoryGb(memory);
  const preferred = String(planType || 'SHARED').toUpperCase();
  const planCandidates = [preferred];
  if (gb > 4 && !planCandidates.includes('DEDICATED')) planCandidates.push('DEDICATED');
  if (gb <= 4 && !planCandidates.includes('SHARED')) planCandidates.push('SHARED');

  let lastError = null;
  for (const pt of planCandidates) {
    try {
      const hit = await resolvePriceIdsFromPlanCatalog(api, { gb, planType: pt });
      if (!hit) continue;

      const resolvedGb =
        labelGbFromCatalogEntry({ label: hit.resolvedRamLabel }) ||
        Math.round(Number(hit.resolvedRamMb || 0) / 1024);
      if (resolvedGb > 0 && resolvedGb < gb) {
        lastError = new Error(
          `Panel ${pt} tier "${hit.resolvedRamLabel}" is below ordered ${gb}GB`
        );
        continue;
      }

      return hit;
    } catch (err) {
      lastError = err;
    }
  }

  throw (
    lastError ||
    new Error(
      `No ${gb}GB RAM tier on reseller panel (tried plan types: ${planCandidates.join(', ')})`
    )
  );
}

function resolveEffectiveResellerPlanType(stockCfg, priceIds) {
  return priceIds?.planType || stockCfg?.planType || 'SHARED';
}

function isResellerApiStock(ipStock, order) {
  const tags = Array.isArray(ipStock?.tags) ? ipStock.tags : [];
  const provider = (ipStock?.provider || '').toString().toLowerCase();

  const hasConfig = !!(
    ipStock?.defaultConfigurations?.resellerApi ||
    ipStock?.defaultConfigurations?.get?.('resellerApi')
  );
  const tagged = tags.some((t) => ['reseller-api', 'resellerapi', 'primevps', 'primevm'].includes(String(t).toLowerCase()));
  const byProvider = provider === 'reseller-api' || provider === 'resellerapi';
  const byOrder = !!order?.resellerVmId || order?.provider === 'reseller-api';

  return hasConfig || tagged || byProvider || byOrder;
}

module.exports = {
  readResellerApiStockConfig,
  normalizeResellerZoneIds,
  resolveExpectedZoneIds,
  resolveResellerZoneCandidatesForPurchase,
  parseMemoryGb,
  resolvePriceIdsForMemory,
  resolveMemoryConfigEntry,
  resolveCouponCodeForMemory,
  normalizeCompanyCouponConfig,
  normalizeCouponByMemory,
  resolveZoneIsoIdFromCatalog,
  autoResolveResellerPriceIds,
  resolveEffectiveResellerPlanType,
  isResellerApiStock,
};
