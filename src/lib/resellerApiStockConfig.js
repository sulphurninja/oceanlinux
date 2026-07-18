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
 *   defaultOs: { Linux: { zoneIsoId: 4 }, Windows: { zoneIsoId: 2 } }
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
  };
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

function resolvePriceIdsForMemory(stockCfg, memory) {
  if (!stockCfg?.priceByMemory) return null;
  const variations = [
    memory,
    String(memory || '').toLowerCase(),
    String(memory || '').toUpperCase(),
    String(memory || '').replace(/\s+/g, ''),
  ].filter(Boolean);

  for (const key of variations) {
    const hit = stockCfg.priceByMemory[key];
    if (hit && typeof hit === 'object') return hit;
  }

  const entries = Object.entries(stockCfg.priceByMemory).filter(([, v]) => v && typeof v === 'object');
  if (entries.length === 1) return entries[0][1];
  return null;
}

/**
 * Best-effort ISO pick from a zone catalog for the order OS family.
 */
function resolveZoneIsoIdFromCatalog(isos, { isWindows, orderOs } = {}) {
  const list = Array.isArray(isos) ? isos : (isos?.isos || []);
  if (!list.length) return null;

  const os = String(orderOs || '').toLowerCase();
  const pick = (pred) => list.find(pred);

  if (isWindows || os.includes('windows')) {
    return (
      pick((i) => /2022|windows/i.test(String(i.name || i.isoName || ''))) ||
      pick((i) => String(i.osType || '').toUpperCase().includes('WINDOWS'))
    )?.id ?? null;
  }
  if (os.includes('centos')) {
    return pick((i) => /centos/i.test(String(i.name || i.isoName || '')))?.id ?? null;
  }
  if (os.includes('24')) {
    return pick((i) => /ubuntu24|24/i.test(String(i.name || i.isoName || '')))?.id ?? null;
  }
  return (
    pick((i) => /ubuntu22|22/i.test(String(i.name || i.isoName || ''))) ||
    pick((i) => String(i.osType || '').toUpperCase() === 'UBUNTU')
  )?.id ?? list[0]?.id ?? null;
}

/**
 * When admin hasn't mapped price IDs, derive them from the live pricing catalog.
 */
async function autoResolveResellerPriceIds(api, { memory, planType = 'SHARED' }) {
  const gb = parseMemoryGb(memory);
  const pt = String(planType || 'SHARED').toUpperCase();
  const [cpuList, ramList, diskList, bwList] = await Promise.all([
    api.getPricingCatalog(pt, 'cpu'),
    api.getPricingCatalog(pt, 'ram'),
    api.getPricingCatalog(pt, 'disk'),
    api.getPricingCatalog(pt, 'bandwidth'),
  ]);

  const ramEntry =
    ramList.find((x) => x.ramMb === gb * 1024) ||
    ramList.find((x) => String(x.label) === String(gb)) ||
    ramList.slice().sort((a, b) => a.ramMb - b.ramMb).find((x) => x.ramMb >= gb * 1024) ||
    ramList[0];

  const targetCores = Math.max(1, Math.min(8, Math.ceil(gb / 2)));
  const cpuEntry =
    cpuList.find((x) => x.cores === targetCores) ||
    cpuList.find((x) => x.cores === 2) ||
    cpuList[0];

  const diskEntry = diskList[0];
  const bwEntry = bwList[0];

  if (!ramEntry?.id || !cpuEntry?.id || !diskEntry?.id || !bwEntry?.id) {
    throw new Error('Could not auto-resolve pricing IDs from upstream catalog');
  }

  return {
    cpuPriceId: cpuEntry.id,
    ramPriceId: ramEntry.id,
    diskPriceId: diskEntry.id,
    bandwidthPriceId: bwEntry.id,
  };
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
  resolveZoneIsoIdFromCatalog,
  autoResolveResellerPriceIds,
  isResellerApiStock,
};
