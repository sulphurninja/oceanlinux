/**
 * KuroHost Cloud live stock — zone = IP stock.
 *
 * GET /zones → if the plan's cloudZoneId appears in items, the plan is in stock.
 * Each IP stock maps to one (or more fallback) KuroHost zone IDs in
 * defaultConfigurations.kurohost.cloudZoneId / zoneIds.
 */

const Company = require('@/models/companyModel').default;
const IPStock = require('@/models/ipStockModel');
const KurohostApi = require('@/services/kurohostApi');
const { getCompanyKurohostApiConfig, companyUsesKurohostLiveStock } = require('@/lib/companyKurohostApi');
const {
  readKurohostStockConfig,
  stockHasKurohostConfig,
} = require('@/lib/kurohostStockConfig');
const { usesKurohostLiveStock, storeAutoUnhideUpdate } = require('@/lib/ipStockAvailability');
const { toPlainConfigurations, getIpStockMemoryKeys, sanitizeVariantStockMap } = require('@/lib/advpsLiveStock');

const LOG = '[KUROHOST-LIVE-STOCK]';
const STOCK_ROW_TTL_MS = 5 * 60 * 1000;
const GLOBAL_REFRESH_INTERVAL_MS = 8 * 60 * 1000;

function isRecentStockSync(iso, ttlMs = STOCK_ROW_TTL_MS) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < ttlMs;
}

function normalizeZonesResponse(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

function resolveZoneIds(stockCfg) {
  const ids = [];
  if (Array.isArray(stockCfg?.zoneIds)) {
    for (const z of stockCfg.zoneIds) {
      const s = String(z || '').trim();
      if (s) ids.push(s);
    }
  }
  const primary = String(stockCfg?.cloudZoneId || '').trim();
  if (primary && !ids.includes(primary)) ids.unshift(primary);
  return ids;
}

function isKurohostIpStock(stock) {
  if (!stock?.company) return false;
  const cfg = readKurohostStockConfig(stock);
  if (resolveZoneIds(cfg).length > 0) return true;
  const tags = (stock?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('kurohost') || String(stock?.provider || '').toLowerCase() === 'kurohost';
}

function stockHasKurohostZone(stock) {
  return resolveZoneIds(readKurohostStockConfig(stock)).length > 0;
}

async function getKurohostApiForStock(stock) {
  if (!stock?.company) return null;
  const company = await Company.findById(stock.company).select('kurohostApi name').lean();
  const cfg = getCompanyKurohostApiConfig(company);
  if (!cfg) return null;
  return { api: new KurohostApi(cfg), company, cfg };
}

function pickPrimaryMemory(stock, memories) {
  const keys = memories || getIpStockMemoryKeys(stock);
  const preferred = ['2GB', '4GB', '8GB', '1GB', '16GB'];
  for (const m of preferred) {
    if (keys.includes(m)) return m;
  }
  return keys[0] || '';
}

/**
 * Check whether configured zone(s) exist on KuroHost catalog.
 */
async function checkKurohostZoneStock(api, { stockCfg, memory, zonesList = null }) {
  const zoneIds = resolveZoneIds(stockCfg);
  const zones = normalizeZonesResponse(zonesList || (await api.listZones()));
  const checked = [];
  let firstLive = null;

  for (const zoneId of zoneIds) {
    const zone = zones.find((z) => String(z.id) === String(zoneId));
    if (!zone) {
      checked.push({ zoneId, zoneOk: false, reason: `Zone ${zoneId} not found on KuroHost` });
      continue;
    }
    const restricted = String(zone.accessMode || '').toUpperCase() === 'RESTRICTED';
    checked.push({
      zoneId: zone.id,
      zoneName: zone.name || zone.code || zoneId,
      zoneCode: zone.code || '',
      accessMode: zone.accessMode || 'PUBLIC',
      zoneOk: true,
      restricted,
    });
    if (!firstLive) firstLive = zone;
  }

  if (!zoneIds.length) {
    return {
      memory,
      available: false,
      stockMode: 'zone',
      zoneId: null,
      zoneOk: false,
      unitsAvailable: 0,
      reason: 'No KuroHost zone configured on this IP stock',
      message: 'Zone not configured — set cloudZoneId in manageIpStock',
      checkedAt: new Date().toISOString(),
    };
  }

  const zoneOk = !!firstLive;
  const unavailable = checked.filter((r) => !r.zoneOk).map((r) => r.zoneId).join(', ');

  return {
    memory,
    available: zoneOk,
    stockMode: 'zone',
    zoneId: firstLive?.id ?? zoneIds[0],
    zoneName: firstLive?.name || firstLive?.code || checked[0]?.zoneName || '',
    zoneCode: firstLive?.code || '',
    zoneIds,
    zoneOk,
    unitsAvailable: zoneOk ? 1 : 0,
    fallbackZones: checked,
    reason: zoneOk
      ? ''
      : unavailable
        ? `Zone(s) unavailable on KuroHost (${unavailable})`
        : 'Configured zone not available on KuroHost',
    message: zoneOk
      ? `In stock (${firstLive?.name || firstLive?.code || firstLive?.id})`
      : 'Out of stock (zone not available on KuroHost)',
    checkedAt: new Date().toISOString(),
  };
}

async function syncKurohostIpStockRow(stock, { force = false, memoryOnly = null, zonesList = null } = {}) {
  if (!isKurohostIpStock(stock) || !stockHasKurohostZone(stock)) return stock;

  const ctx = await getKurohostApiForStock(stock);
  if (!ctx) return stock;

  const company = ctx.company;
  if (!companyUsesKurohostLiveStock(company) && !usesKurohostLiveStock(stock, company)) {
    return stock;
  }

  if (stock.availabilityManual === true) {
    await IPStock.findByIdAndUpdate(stock._id, { availabilityManual: false });
    stock.availabilityManual = false;
  }

  const defaults = toPlainConfigurations(stock.defaultConfigurations) || {};
  const prevKurohost = defaults.kurohost || {};
  if (!force && isRecentStockSync(prevKurohost.lastStockSync, STOCK_ROW_TTL_MS)) {
    return stock;
  }

  let memories = getIpStockMemoryKeys(stock);
  if (memories.length === 0) memories = ['4GB', '2GB', '8GB'];

  const stockCfg = readKurohostStockConfig(stock);
  const memoriesToCheck = memoryOnly
    ? [memoryOnly]
    : memories.length
      ? memories
      : [pickPrimaryMemory(stock, memories)].filter(Boolean);

  let resolvedZones = zonesList;
  if (!resolvedZones) {
    try {
      resolvedZones = await ctx.api.listZones();
    } catch (err) {
      console.warn(`${LOG} listZones failed for ${stock.name}:`, err.message);
    }
  }

  const variantResults = { ...(prevKurohost.variantStock || {}) };
  let anyAvailable = false;

  for (const memory of memoriesToCheck) {
    try {
      const result = await checkKurohostZoneStock(ctx.api, {
        stockCfg,
        memory,
        zonesList: resolvedZones,
      });
      variantResults[memory] = result;
      if (result.available) anyAvailable = true;
    } catch (err) {
      variantResults[memory] = {
        memory,
        available: false,
        reason: err.message,
        message: err.message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  if (!memoryOnly && memories.length > 1) {
    const primary = pickPrimaryMemory(stock, memories);
    const primaryResult = variantResults[primary];
    if (primaryResult?.available) {
      for (const m of memories) {
        if (!variantResults[m]?.available) {
          variantResults[m] = { ...primaryResult, memory: m, mirroredFrom: primary };
        }
      }
      anyAvailable = true;
    }
  }

  const nextKurohost = {
    ...prevKurohost,
    cloudZoneId: stockCfg.cloudZoneId,
    zoneIds: resolveZoneIds(stockCfg),
    flavorByMemory: stockCfg.flavorByMemory,
    osTemplateByMemory: stockCfg.osTemplateByMemory,
    defaultOs: stockCfg.defaultOs,
    variantStock: sanitizeVariantStockMap(variantResults),
    lastStockSync: new Date().toISOString(),
  };

  const updatePayload = {
    available: anyAvailable,
    stockCount: anyAvailable ? 1 : 0,
    defaultConfigurations: {
      ...defaults,
      kurohost: nextKurohost,
    },
    ...storeAutoUnhideUpdate(stock, anyAvailable),
  };

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id).lean();
}

function isKurohostVariantInStock(stock, memory, company) {
  if (!usesKurohostLiveStock(stock, company)) return true;
  const cfg = toPlainConfigurations(stock?.defaultConfigurations)?.kurohost || {};
  const row = cfg.variantStock?.[memory];
  if (row && typeof row === 'object') return row.available === true;
  return !!stock?.available;
}

async function verifyKurohostMemoryInStock(stock, memory, { zonesList = null, preferCache = true } = {}) {
  const company = stock?.company
    ? await Company.findById(stock.company).select('kurohostApi').lean()
    : null;
  if (!usesKurohostLiveStock(stock, company)) {
    return { ok: true, skipped: true };
  }

  const cfg = toPlainConfigurations(stock?.defaultConfigurations)?.kurohost || {};
  const cached = cfg.variantStock?.[memory];
  const cacheFresh = preferCache && isRecentStockSync(cached?.checkedAt || cfg.lastStockSync, STOCK_ROW_TTL_MS * 2);

  if (preferCache && cacheFresh && cached?.available === true) {
    return { ok: true, result: cached, fromCache: true };
  }

  const ctx = await getKurohostApiForStock(stock);
  if (!ctx) {
    return { ok: false, message: 'KuroHost API not configured for this company' };
  }

  try {
    const stockCfg = readKurohostStockConfig(stock);
    const result = await checkKurohostZoneStock(ctx.api, {
      stockCfg,
      memory,
      zonesList,
    });

    if (!result.available) {
      return {
        ok: false,
        message: result.reason || result.message || 'This zone is currently unavailable on KuroHost.',
        result,
      };
    }
    return { ok: true, result };
  } catch (err) {
    if (cacheFresh && cached?.available === true) {
      return { ok: true, result: cached, fromCache: true };
    }
    return { ok: false, message: err.message || 'Unable to verify KuroHost zone stock' };
  }
}

async function refreshKurohostStockForCustomer({ force = false } = {}) {
  if (!global.kurohostCustomerRefresh) {
    global.kurohostCustomerRefresh = { lastAt: 0, lastResult: null };
  }
  const cache = global.kurohostCustomerRefresh;
  const now = Date.now();

  if (!force && cache.lastAt && now - cache.lastAt < GLOBAL_REFRESH_INTERVAL_MS) {
    return {
      success: true,
      skipped: true,
      throttled: true,
      refreshedAt: cache.lastAt,
      nextRefreshInMs: GLOBAL_REFRESH_INTERVAL_MS - (now - cache.lastAt),
      ...(cache.lastResult || {}),
    };
  }

  const { default: connectDB } = await import('@/lib/db');
  await connectDB();

  const candidates = await IPStock.find({ company: { $ne: null } }).lean();
  const companyIds = [...new Set(candidates.filter(isKurohostIpStock).map((r) => String(r.company)))];
  const companies = companyIds.length
    ? await Company.find({ _id: { $in: companyIds } }).select('kurohostApi').lean()
    : [];
  const liveCompanyIds = new Set(
    companies.filter(companyUsesKurohostLiveStock).map((c) => String(c._id))
  );
  const rows = candidates.filter(
    (r) => liveCompanyIds.has(String(r.company)) && stockHasKurohostZone(r)
  );

  const rowsByCompany = {};
  for (const row of rows) {
    const cid = String(row.company);
    if (!rowsByCompany[cid]) rowsByCompany[cid] = [];
    rowsByCompany[cid].push(row);
  }

  let synced = 0;
  let inStock = 0;

  for (const [companyId, companyRows] of Object.entries(rowsByCompany)) {
    let zonesList = null;
    try {
      const ctx = await getKurohostApiForStock({ company: companyId });
      if (ctx) zonesList = await ctx.api.listZones();
    } catch (err) {
      console.warn(`${LOG} listZones failed for company ${companyId}:`, err.message);
    }

    for (const row of companyRows) {
      try {
        const updated = await syncKurohostIpStockRow(row, { force: true, zonesList });
        synced += 1;
        if (updated?.available) inStock += 1;
      } catch (err) {
        console.warn(`${LOG} sync failed for ${row.name}:`, err.message);
      }
    }
  }

  const result = { success: true, synced, inStock, companies: Object.keys(rowsByCompany).length };
  cache.lastAt = now;
  cache.lastResult = result;
  return result;
}

module.exports = {
  isKurohostIpStock,
  stockHasKurohostZone,
  checkKurohostZoneStock,
  syncKurohostIpStockRow,
  isKurohostVariantInStock,
  verifyKurohostMemoryInStock,
  refreshKurohostStockForCustomer,
  normalizeZonesResponse,
};
