/**
 * Live Netbay VM stock checks via GET /api/v1/services/stock.
 * Used before customer purchase and when refreshing IP Stock listings.
 */

const Company = require('@/models/companyModel').default;
const IPStock = require('@/models/ipStockModel');
const NetbayApi = require('@/services/netbayApi');
const { getCompanyNetbayApiConfig, companyUsesNetbayLiveStock } = require('@/lib/companyNetbayApi');
const { toPlainConfigurations } = require('@/lib/advpsLiveStock');
const { usesNetbayLiveStock } = require('@/lib/ipStockAvailability');

const LOG = '[NETBAY-LIVE-STOCK]';

function readNetbayStockConfig(ipStock) {
  const cfg = toPlainConfigurations(ipStock?.defaultConfigurations)?.netbay || {};
  const planByMemory =
    cfg.planByMemory instanceof Map
      ? Object.fromEntries(cfg.planByMemory)
      : (cfg.planByMemory || {});
  const defaultOs =
    cfg.defaultOs instanceof Map
      ? Object.fromEntries(cfg.defaultOs)
      : (cfg.defaultOs || {});

  return {
    groupTag: cfg.groupTag || '',
    planByMemory,
    defaultOs,
  };
}

function resolveNetbayPlanId({ planByMemory, ram }) {
  if (!planByMemory || typeof planByMemory !== 'object') return '';
  const variations = [
    ram,
    String(ram || '').toLowerCase(),
    String(ram || '').toUpperCase(),
    String(ram || '').replace(/\s+/g, ''),
  ].filter(Boolean);

  for (const v of variations) {
    const id = planByMemory[v];
    if (id) return String(id);
  }

  const entries = Object.entries(planByMemory).filter(([, v]) => !!v);
  if (entries.length === 1) return String(entries[0][1]);
  return '';
}

function isWindowsStock(ipStock) {
  const serverType = String(ipStock?.serverType || '').toUpperCase();
  if (serverType === 'VPS') return true;
  if (serverType === 'LINUX') return false;
  const name = String(ipStock?.name || '').toLowerCase();
  return name.includes('windows') || name.includes('rdp');
}

function netbayOsHints({ defaultOs, isWindows }) {
  const hints = [];
  if (defaultOs) {
    if (isWindows && defaultOs.Windows) hints.push(defaultOs.Windows);
    if (!isWindows && defaultOs.Linux) hints.push(defaultOs.Linux);
  }
  if (isWindows) hints.push('Windows Server 2022', 'Windows 2022', 'Windows 2022 64');
  else hints.push('Ubuntu 22', 'Ubuntu 22.04', 'ubuntu');
  return hints;
}

async function resolveNetbayOsName(api, { stockCfg, isWindows }, osListCache) {
  let osList = osListCache?.list;
  if (!osList) {
    const osRes = await api.listOs({});
    osList = osRes?.data?.os || [];
    if (osListCache) osListCache.list = osList;
  }

  return NetbayApi.resolveOsTemplateName(osList, {
    preferred: netbayOsHints({ defaultOs: stockCfg.defaultOs, isWindows }),
    isWindows,
  });
}

function isNetbayIpStock(stock) {
  if (!stock?.company) return false;
  const cfg = readNetbayStockConfig(stock);
  const hasPlans = Object.values(cfg.planByMemory || {}).some(Boolean);
  return hasPlans;
}

async function getNetbayApiForStock(stock) {
  if (!stock?.company) return null;
  const company = await Company.findById(stock.company).select('netbayApi name').lean();
  const cfg = getCompanyNetbayApiConfig(company);
  if (!cfg) return null;
  return { api: new NetbayApi(cfg), companyName: company?.name || '' };
}

async function checkNetbayVariantStock(api, { stockCfg, memory, ipStock, isWindows }, osListCache) {
  const planId = resolveNetbayPlanId({ planByMemory: stockCfg.planByMemory, ram: memory });
  if (!planId) {
    return { available: false, reason: `Netbay plan not configured for ${memory}` };
  }

  const osName = await resolveNetbayOsName(api, { stockCfg, isWindows }, osListCache);
  if (!osName) {
    return { available: false, reason: 'Netbay OS template not found for this plan' };
  }

  const result = await api.isServiceStockAvailable({
    planId,
    os: osName,
    groupTag: stockCfg.groupTag || undefined,
  });

  return {
    ...result,
    planId,
    os: osName,
    memory,
    groupTag: stockCfg.groupTag || null,
  };
}

/**
 * Sync one IPStock row from Netbay stock API. Marks `available` false when
 * upstream has no capacity (unless availabilityManual is set).
 */
async function syncNetbayIpStockRow(stock) {
  const ctx = await getNetbayApiForStock(stock);
  if (!ctx) return stock;

  const company = await Company.findById(stock.company).select('netbayApi').lean();
  if (!companyUsesNetbayLiveStock(company)) {
    return stock;
  }

  const stockCfg = readNetbayStockConfig(stock);
  const isWindows = isWindowsStock(stock);
  const osListCache = {};
  const variantResults = {};
  let upstreamYes = 0;
  let upstreamNo = 0;
  let upstreamSkipped = 0;

  const memories = Object.keys(stockCfg.planByMemory || {}).filter(
    (m) => stockCfg.planByMemory[m]
  );

  for (const memory of memories) {
    try {
      const result = await checkNetbayVariantStock(
        ctx.api,
        { stockCfg, memory, ipStock: stock, isWindows },
        osListCache
      );
      variantResults[memory] = result;
      if (result.skipped || result.available === null) {
        upstreamSkipped += 1;
      } else if (result.available) {
        upstreamYes += 1;
      } else {
        upstreamNo += 1;
      }
    } catch (err) {
      console.warn(`${LOG} stock check failed for ${stock.name} ${memory}:`, err.message);
      upstreamSkipped += 1;
      variantResults[memory] = { available: null, skipped: true, reason: err.message };
    }
  }

  // Live mode: availability follows NetBay API only (no manual stockCount).
  let shouldAvailable = false;
  if (upstreamYes > 0) {
    shouldAvailable = true;
  } else if (upstreamNo > 0) {
    shouldAvailable = false;
  } else {
    shouldAvailable = false;
  }

  const defaults = toPlainConfigurations(stock.defaultConfigurations);
  const updatePayload = {
    defaultConfigurations: {
      ...defaults,
      netbay: {
        ...stockCfg,
        lastStockSync: new Date().toISOString(),
        variantStock: variantResults,
      },
    },
  };

  if (!stock.availabilityManual) {
    updatePayload.available = shouldAvailable;
  }

  if (usesNetbayLiveStock(stock, company)) {
    updatePayload.stockCount = 0;
  }

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id);
}

/** Verify a specific memory tier is in stock upstream before checkout. */
async function verifyNetbayMemoryInStock(stock, memory) {
  if (!isNetbayIpStock(stock)) {
    return { ok: true, skipped: true };
  }

  const ctx = await getNetbayApiForStock(stock);
  if (!ctx) {
    return {
      ok: false,
      message: 'Unable to verify stock right now. Please refresh and try again.',
    };
  }

  const company = await Company.findById(stock.company).select('netbayApi').lean();
  if (!companyUsesNetbayLiveStock(company)) {
    return { ok: true, skipped: true, manual: true };
  }

  const stockCfg = readNetbayStockConfig(stock);
  const isWindows = isWindowsStock(stock);

  try {
    const result = await checkNetbayVariantStock(
      ctx.api,
      { stockCfg, memory, ipStock: stock, isWindows },
      {}
    );

    if (!result.available && !result.skipped && result.available !== null) {
      return {
        ok: false,
        message:
          result.reason ||
          result.message ||
          'No VM capacity available at this location. Please try another plan or check back later.',
        result,
      };
    }

    if (result.skipped || result.available === null) {
      return {
        ok: false,
        message:
          'Unable to verify stock from our provider right now. Please refresh and try again.',
        result,
      };
    }

    return { ok: true, result };
  } catch (err) {
    console.warn(`${LOG} verify failed:`, err.message);
    return {
      ok: false,
      message: err.message || 'Unable to verify stock right now',
    };
  }
}

/** Refresh all Netbay-linked IPStock rows (customer IP Stock page). */
async function refreshNetbayStockForCustomer({ force = false } = {}) {
  if (!global.netbayCustomerRefresh) {
    global.netbayCustomerRefresh = { lastAt: 0, lastResult: null };
  }
  const cache = global.netbayCustomerRefresh;
  const INTERVAL_MS = 60_000;
  const now = Date.now();

  if (!force && cache.lastAt && now - cache.lastAt < INTERVAL_MS) {
    return {
      success: true,
      skipped: true,
      throttled: true,
      refreshedAt: cache.lastAt,
      nextRefreshInMs: INTERVAL_MS - (now - cache.lastAt),
      ...(cache.lastResult || {}),
    };
  }

  const { default: connectDB } = await import('@/lib/db');
  await connectDB();

  const candidates = await IPStock.find({ company: { $ne: null } }).lean();
  const companyIds = [...new Set(candidates.filter(isNetbayIpStock).map((r) => String(r.company)))];
  const companies = companyIds.length
    ? await Company.find({ _id: { $in: companyIds } }).select('netbayApi').lean()
    : [];
  const liveCompanyIds = new Set(
    companies.filter(companyUsesNetbayLiveStock).map((c) => String(c._id))
  );
  const netbayRows = candidates.filter(
    (row) => isNetbayIpStock(row) && liveCompanyIds.has(String(row.company))
  );

  let updated = 0;
  let inStock = 0;
  const errors = [];

  for (const row of netbayRows) {
    try {
      const synced = await syncNetbayIpStockRow(row);
      updated += 1;
      if (synced?.available) inStock += 1;
    } catch (err) {
      errors.push({ id: row._id, name: row.name, error: err.message });
    }
  }

  const result = {
    success: true,
    skipped: false,
    throttled: false,
    refreshedAt: now,
    total: netbayRows.length,
    updated,
    inStock,
    errors,
  };

  cache.lastAt = now;
  cache.lastResult = result;
  return result;
}

/** When switching NetBay from live API stock to manual units, restore availability from stockCount. */
async function restoreNetbayManualStockAvailability(companyId) {
  const stocks = await IPStock.find({ company: companyId }).lean();
  for (const stock of stocks) {
    if (!isNetbayIpStock(stock)) continue;
    const count = Math.max(0, Number(stock.stockCount) || 0);
    await IPStock.collection.updateOne(
      { _id: stock._id },
      { $set: { available: count > 0, stockCount: count } }
    );
  }
}

module.exports = {
  readNetbayStockConfig,
  resolveNetbayPlanId,
  isNetbayIpStock,
  syncNetbayIpStockRow,
  verifyNetbayMemoryInStock,
  refreshNetbayStockForCustomer,
  restoreNetbayManualStockAvailability,
};
