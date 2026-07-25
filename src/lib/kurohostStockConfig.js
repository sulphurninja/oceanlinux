/**
 * Per-IPStock KuroHost catalog mapping (zone / flavor / OS template ids).
 * Stored under defaultConfigurations.kurohost on the IPStock document.
 */

function readKurohostStockConfig(ipStock) {
  const cfg = ipStock?.defaultConfigurations?.get?.('kurohost')
    || ipStock?.defaultConfigurations?.kurohost
    || {};

  const flavorByMemory = cfg.flavorByMemory instanceof Map
    ? Object.fromEntries(cfg.flavorByMemory)
    : (cfg.flavorByMemory || {});

  const osTemplateByMemory = cfg.osTemplateByMemory instanceof Map
    ? Object.fromEntries(cfg.osTemplateByMemory)
    : (cfg.osTemplateByMemory || {});

  const defaultOs = cfg.defaultOs instanceof Map
    ? Object.fromEntries(cfg.defaultOs)
    : (cfg.defaultOs || {});

  return {
    cloudZoneId: cfg.cloudZoneId || '',
    zoneIds: Array.isArray(cfg.zoneIds) ? cfg.zoneIds.map(String) : [],
    flavorByMemory,
    osTemplateByMemory,
    defaultOs,
    variantStock: cfg.variantStock || {},
    lastStockSync: cfg.lastStockSync || null,
  };
}

function resolveKurohostFlavorId(stockCfg, memory) {
  const map = stockCfg?.flavorByMemory || {};
  const key = String(memory || '').trim();
  if (map[key]) return map[key];
  const normalized = key.replace(/\s+/g, '').toUpperCase();
  for (const [k, v] of Object.entries(map)) {
    if (String(k).replace(/\s+/g, '').toUpperCase() === normalized) return v;
  }
  return null;
}

function resolveKurohostOsTemplateId(stockCfg, { memory, isWindows } = {}) {
  const byMem = stockCfg?.osTemplateByMemory || {};
  const memKey = String(memory || '').trim();
  if (byMem[memKey]) return byMem[memKey];

  const defaults = stockCfg?.defaultOs || {};
  if (isWindows) {
    return defaults.Windows || defaults.windows || defaults.WINDOWS || '';
  }
  return defaults.Linux || defaults.linux || defaults.LINUX || '';
}

function stockHasKurohostConfig(ipStock) {
  const cfg = readKurohostStockConfig(ipStock);
  return !!(cfg.cloudZoneId && Object.keys(cfg.flavorByMemory || {}).length > 0);
}

function stockHasKurohostPlans(stock) {
  if (!stock?.company) return false;
  const cfg = readKurohostStockConfig(stock);
  return !!(cfg.cloudZoneId || Object.keys(cfg.flavorByMemory || {}).some(Boolean));
}

module.exports = {
  readKurohostStockConfig,
  resolveKurohostFlavorId,
  resolveKurohostOsTemplateId,
  stockHasKurohostConfig,
  stockHasKurohostPlans,
};
