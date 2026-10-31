/**
 * Shared helpers for PrimeVPS / Hostheaven panel zone mapping on IP stock rows.
 */

function getResellerApiBlock(stock) {
  if (!stock?.defaultConfigurations) return {};
  if (typeof stock.defaultConfigurations.get === 'function') {
    return stock.defaultConfigurations.get('resellerApi') || {};
  }
  return stock.defaultConfigurations.resellerApi || {};
}

function readResellerApiConfigFromStock(stock) {
  const cfg = getResellerApiBlock(stock) || {};
  const zoneIds = Array.isArray(cfg.zoneIds)
    ? cfg.zoneIds.map(Number).filter((n) => Number.isFinite(n))
    : cfg.zoneId != null
      ? [Number(cfg.zoneId)]
      : [];

  return {
    zoneId: zoneIds[0] ?? (cfg.zoneId != null ? Number(cfg.zoneId) : null),
    zoneIds,
    zoneName: cfg.zoneName || '',
    zoneNames: cfg.zoneNames && typeof cfg.zoneNames === 'object' ? cfg.zoneNames : {},
    planType: cfg.planType || 'SHARED',
    gateway: cfg.gateway || 'WALLET',
    couponCode: cfg.couponCode || '',
    couponByMemory:
      cfg.couponByMemory && typeof cfg.couponByMemory === 'object' ? cfg.couponByMemory : {},
  };
}

/**
 * Drop zone IDs that no longer exist on the panel (deleted/renumbered regions).
 * Prevents ghost primaries like ID 34 when the live list only has 1,2,5,6,8.
 */
function sanitizeZoneIdsAgainstPanel(zoneIds, zonesList) {
  const valid = new Set(
    (zonesList || [])
      .map((z) => Number(z?.id))
      .filter((n) => Number.isFinite(n))
  );
  const ids = (zoneIds || []).map(Number).filter((n) => Number.isFinite(n));
  const kept = [];
  const removed = [];
  for (const id of ids) {
    if (valid.has(id)) kept.push(id);
    else removed.push(id);
  }
  return { zoneIds: kept, removed };
}

function buildResellerZoneConfig(zones, zoneIds) {
  const cleanIds = (zoneIds || []).map(Number).filter((n) => Number.isFinite(n));
  const zoneNames = {};
  for (const id of cleanIds) {
    const zone = (zones || []).find((z) => Number(z.id) === Number(id));
    if (zone?.name) zoneNames[String(id)] = zone.name;
  }
  const primary = (zones || []).find((z) => Number(z.id) === Number(cleanIds[0]));
  return {
    zoneId: cleanIds[0] ?? null,
    zoneNames,
    zoneIds: cleanIds,
    zoneName: primary?.name,
  };
}

function applyResellerZonesToStockDocument(stock, zoneIds, zonesList) {
  if (!stock) throw new Error('Stock missing');

  const existing = readResellerApiConfigFromStock(stock);
  const prevRaw = { ...getResellerApiBlock(stock) };
  const zoneBlock = buildResellerZoneConfig(zonesList, zoneIds);

  const nextResellerApi = {
    ...prevRaw,
    ...zoneBlock,
    planType: existing.planType,
    gateway: existing.gateway,
  };

  if (typeof stock.defaultConfigurations?.set === 'function') {
    stock.defaultConfigurations.set('resellerApi', nextResellerApi);
  } else {
    stock.defaultConfigurations = {
      ...(stock.defaultConfigurations || {}),
      resellerApi: nextResellerApi,
    };
  }

  const tags = Array.isArray(stock.tags) ? [...stock.tags] : [];
  const lower = tags.map((t) => String(t).toLowerCase());
  if (!lower.includes('reseller-api')) {
    stock.tags = [...tags, 'reseller-api'];
  }

  stock.markModified?.('defaultConfigurations');
  return stock;
}

function serializeResellerZonesForClient(stock) {
  const cfg = readResellerApiConfigFromStock(stock);
  return {
    configured: cfg.zoneIds.length > 0,
    zoneId: cfg.zoneId,
    zoneIds: cfg.zoneIds,
    zoneName: cfg.zoneName || null,
  };
}

module.exports = {
  getResellerApiBlock,
  readResellerApiConfigFromStock,
  sanitizeZoneIdsAgainstPanel,
  buildResellerZoneConfig,
  applyResellerZonesToStockDocument,
  serializeResellerZonesForClient,
};
