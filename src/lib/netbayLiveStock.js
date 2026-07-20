/**
 * Live Netbay VM stock checks via GET /api/v1/services/stock.
 *
 * NetBay rate limits (10 min windows):
 *   Stock: 120 GET /services/stock  |  Read: 600 GET /plans,/os,/services…
 *   Action: 100 POST  |  Global: 1000 total
 *
 * We keep stock usage low: cron sync every 8 min (~6–12 checks), checkout
 * syncs one plan only, no refresh on every customer page load, OS list cached 30 min.
 */

const Company = require('@/models/companyModel').default;
const IPStock = require('@/models/ipStockModel');
const NetbayApi = require('@/services/netbayApi');
const { getCompanyNetbayApiConfig, companyUsesNetbayLiveStock } = require('@/lib/companyNetbayApi');
const { toPlainConfigurations } = require('@/lib/advpsLiveStock');
const { usesNetbayLiveStock } = require('@/lib/ipStockAvailability');

const LOG = '[NETBAY-LIVE-STOCK]';

/** Per-row DB cache — skip upstream poll if synced recently. */
const STOCK_ROW_TTL_MS = 5 * 60 * 1000;
/** Global refresh throttle for cron / admin force sync. */
const GLOBAL_REFRESH_INTERVAL_MS = 8 * 60 * 1000;
/** Max stock GETs per refresh batch — leave headroom for checkout (120 / 10 min). */
const STOCK_REFRESH_BUDGET = 100;
/** Trust cached variant results for checkout when upstream is rate-limited. */
const STOCK_CACHE_TRUST_MS = 10 * 60 * 1000;

function isRecentStockSync(iso, ttlMs = STOCK_CACHE_TRUST_MS) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < ttlMs;
}

function stockCheckKey({ planId, os, groupTag }) {
  return `${planId}|${os}|${groupTag || ''}`;
}

/** One representative RAM tier for listing sync (saves stock API quota). */
function pickPrimaryMemory(memories, planByMemory) {
  const preferred = ['2GB', '4GB', '8GB', '1GB', '16GB'];
  for (const m of preferred) {
    if (memories.includes(m) && planByMemory[m]) return m;
  }
  return memories.find((m) => planByMemory[m]) || memories[0] || '';
}

function applyUpstreamResultToVariantResults({ result, memory, variantResults, prevNetbay, counters }) {
  const prevVariant = prevNetbay.variantStock?.[memory];
  if ((result.skipped || result.available === null) && prevVariant?.available === true) {
    variantResults[memory] = {
      ...prevVariant,
      rateLimited: !!result.rateLimited,
      skipped: !!result.skipped,
      reason: result.reason || prevVariant.reason,
      message: result.message || prevVariant.message,
      checkedAt: new Date().toISOString(),
    };
    counters.upstreamYes += 1;
    return;
  }

  variantResults[memory] = result;
  if (result.skipped || result.available === null) {
    counters.upstreamSkipped += 1;
  } else if (result.available) {
    counters.upstreamYes += 1;
  } else {
    counters.upstreamNo += 1;
  }
}

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
async function syncNetbayIpStockRow(stock, { force = false, sharedCheckCache = null, sharedOsListCache = null, stockBudget = null, memoryOnly = null } = {}) {
  const ctx = await getNetbayApiForStock(stock);
  if (!ctx) return stock;

  const company = await Company.findById(stock.company).select('netbayApi').lean();
  if (!companyUsesNetbayLiveStock(company)) {
    return stock;
  }

  if (stock.availabilityManual === true) {
    return IPStock.findById(stock._id).lean();
  }

  const defaults = toPlainConfigurations(stock.defaultConfigurations);
  const prevNetbay = defaults?.netbay || {};
  if (!force && isRecentStockSync(prevNetbay.lastStockSync, STOCK_ROW_TTL_MS)) {
    return stock;
  }

  const stockCfg = readNetbayStockConfig(stock);
  const isWindows = isWindowsStock(stock);
  const osListCache = sharedOsListCache || {};
  const checkCache = sharedCheckCache || new Map();
  const variantResults = {};

  const memories = Object.keys(stockCfg.planByMemory || {}).filter(
    (m) => stockCfg.planByMemory[m]
  );

  const memoriesToCheck = memoryOnly
    ? memories.filter((m) => m === memoryOnly)
    : [pickPrimaryMemory(memories, stockCfg.planByMemory)].filter(Boolean);

  const counters = { upstreamYes: 0, upstreamNo: 0, upstreamSkipped: 0 };

  for (const memory of memoriesToCheck) {
    try {
      const planId = resolveNetbayPlanId({ planByMemory: stockCfg.planByMemory, ram: memory });
      const osName = await resolveNetbayOsName(
        ctx.api,
        { stockCfg, isWindows },
        osListCache
      );
      const cacheKey = stockCheckKey({ planId, os: osName, groupTag: stockCfg.groupTag });

      let result;
      if (planId && osName && checkCache.has(cacheKey)) {
        result = { ...checkCache.get(cacheKey), memory };
      } else if (stockBudget && stockBudget.used >= stockBudget.max) {
        result = {
          available: null,
          skipped: true,
          rateLimited: true,
          reason: 'Refresh budget exhausted for this cycle',
          memory,
        };
      } else if (!NetbayApi.isStockCheckAllowed()) {
        result = {
          available: null,
          skipped: true,
          rateLimited: true,
          reason: 'Stock API rate limit — using cached availability',
          memory,
        };
      } else {
        result = await checkNetbayVariantStock(
          ctx.api,
          { stockCfg, memory, ipStock: stock, isWindows },
          osListCache
        );
        if (stockBudget) stockBudget.used += 1;
        if (planId && osName) checkCache.set(cacheKey, result);
      }

      applyUpstreamResultToVariantResults({
        result,
        memory,
        variantResults,
        prevNetbay,
        counters,
      });
    } catch (err) {
      console.warn(`${LOG} stock check failed for ${stock.name} ${memory}:`, err.message);
      const prevVariant = prevNetbay.variantStock?.[memory];
      if (prevVariant?.available === true && isRecentStockSync(prevNetbay.lastStockSync)) {
        variantResults[memory] = { ...prevVariant, checkedAt: new Date().toISOString() };
        counters.upstreamYes += 1;
      } else {
        counters.upstreamSkipped += 1;
        variantResults[memory] = { available: null, skipped: true, reason: err.message };
      }
    }
  }

  // Listing sync: one location check → apply to all RAM tiers on the card
  if (!memoryOnly && memoriesToCheck.length === 1) {
    const primary = memoriesToCheck[0];
    const primaryResult = variantResults[primary];
    if (primaryResult) {
      for (const memory of memories) {
        if (memory === primary) continue;
        variantResults[memory] = {
          ...primaryResult,
          memory,
          planId: resolveNetbayPlanId({ planByMemory: stockCfg.planByMemory, ram: memory }),
          mirroredFrom: primary,
        };
      }
    }
  } else if (memoryOnly) {
    // Keep other tiers aligned with row availability after checkout sync
    const single = variantResults[memoryOnly];
    if (single && !single.skipped && single.available !== null) {
      for (const memory of memories) {
        if (memory === memoryOnly) continue;
        variantResults[memory] = {
          ...single,
          memory,
          planId: resolveNetbayPlanId({ planByMemory: stockCfg.planByMemory, ram: memory }),
          mirroredFrom: memoryOnly,
        };
      }
    }
  }

  let { upstreamYes, upstreamNo, upstreamSkipped } = counters;
  let shouldAvailable = false;
  if (upstreamYes > 0) {
    shouldAvailable = true;
  } else if (upstreamNo > 0) {
    shouldAvailable = false;
  } else if (upstreamSkipped > 0) {
    shouldAvailable = stock.availabilityManual ? !!stock.available : !!stock.available;
  } else {
    shouldAvailable = false;
  }

  const hadRealUpstreamResult = upstreamYes > 0 || upstreamNo > 0;
  if (!hadRealUpstreamResult && upstreamSkipped > 0) {
    console.warn(
      `${LOG} All stock checks skipped for "${stock.name}" (rate limit?) — DB left unchanged`
    );
    return stock;
  }

  // Never persist rate-limit placeholder over good variant data
  for (const memory of Object.keys(variantResults)) {
    const result = variantResults[memory];
    const prev = prevNetbay.variantStock?.[memory];
    if (
      (result.skipped || result.available === null) &&
      prev?.available === true
    ) {
      variantResults[memory] = {
        ...prev,
        rateLimited: !!result.rateLimited,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  const updatePayload = {
    defaultConfigurations: {
      ...defaults,
      netbay: {
        ...stockCfg,
        lastStockSync: new Date().toISOString(),
        variantStock: {
          ...(prevNetbay.variantStock || {}),
          ...variantResults,
        },
      },
    },
  };

  if (!stock.availabilityManual) {
    updatePayload.available = shouldAvailable;
    if (shouldAvailable && stock.autoHiddenFromStore) {
      updatePayload.hiddenFromStore = false;
      updatePayload.autoHiddenFromStore = false;
    }
  }

  if (usesNetbayLiveStock(stock, company)) {
    updatePayload.stockCount = 0;
  }

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id);
}

/** Verify a specific memory tier is in stock upstream before checkout. */
async function verifyNetbayMemoryInStock(stock, memory, { preferCache = false } = {}) {
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
  const defaults = toPlainConfigurations(stock.defaultConfigurations)?.netbay || {};
  const cached = defaults.variantStock?.[memory];
  const cacheFresh = isRecentStockSync(defaults.lastStockSync);

  if (preferCache && cacheFresh && cached?.available === true) {
    return { ok: true, result: cached, fromCache: true };
  }

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
      if (cacheFresh && cached?.available === true) {
        return { ok: true, result: cached, fromCache: true };
      }
      if (result.rateLimited && cacheFresh && stock.available) {
        return { ok: true, result: cached || result, fromCache: true };
      }
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
    if (cacheFresh && cached?.available === true) {
      return { ok: true, result: cached, fromCache: true };
    }
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
  const INTERVAL_MS = GLOBAL_REFRESH_INTERVAL_MS;
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
  const sharedCheckCache = new Map();
  const sharedOsListCache = {};
  const stockBudget = { used: 0, max: STOCK_REFRESH_BUDGET };

  for (const row of netbayRows) {
    try {
      const synced = await syncNetbayIpStockRow(row, {
        force,
        sharedCheckCache,
        sharedOsListCache,
        stockBudget,
      });
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
    stockChecksUsed: stockBudget.used,
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
