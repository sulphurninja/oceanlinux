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
  buildResellerZoneConfig,
  applyResellerZonesToStockDocument,
  serializeResellerZonesForClient,
};
