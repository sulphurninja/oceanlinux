/**
 * Live PrimeVPS / Hostheaven panel stock via wallet + pricing catalog.
 *
 * There is no dedicated GET /stock on the user API (unlike Netbay). We treat
 * a plan as in-stock when:
 *   1) At least one zone is ACTIVE, and
 *   2) Panel wallet balance >= estimated monthly VM price for that RAM tier.
 *
 * Optional: GET /api/reseller/admin/vms/available (403 for user accounts —
 * ignored, wallet check still applies).
 */

const Company = require('@/models/companyModel').default;
const IPStock = require('@/models/ipStockModel');
const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig, companyUsesResellerLiveStock } = require('@/lib/companyResellerApi');
const {
  readResellerApiStockConfig,
  resolvePriceIdsForMemory,
  autoResolveResellerPriceIds,
  isResellerApiStock,
} = require('@/lib/resellerApiStockConfig');
const { usesResellerLiveStock } = require('@/lib/ipStockAvailability');
const { toPlainConfigurations } = require('@/lib/advpsLiveStock');

const LOG = '[RESELLER-LIVE-STOCK]';
const STOCK_ROW_TTL_MS = 5 * 60 * 1000;
const GLOBAL_REFRESH_INTERVAL_MS = 8 * 60 * 1000;

function isRecentStockSync(iso, ttlMs = STOCK_ROW_TTL_MS) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < ttlMs;
}

function isResellerIpStock(stock) {
  return isResellerApiStock(stock, null);
}

function stockHasResellerPanelPlans(stock) {
  if (!stock?.company) return false;
  if (isResellerApiStock(stock, null)) return true;
  const tags = (stock?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('reseller-api') || tags.includes('primevps') || tags.includes('primevm');
}

function isWindowsStock(ipStock) {
  const serverType = String(ipStock?.serverType || '').toUpperCase();
  if (serverType === 'VPS') return true;
  if (serverType === 'LINUX') return false;
  const name = String(ipStock?.name || '').toLowerCase();
  return name.includes('windows') || name.includes('rdp');
}

function pickPrimaryMemory(memories) {
  const preferred = ['2GB', '4GB', '8GB', '1GB', '16GB'];
  for (const m of preferred) {
    if (memories.includes(m)) return m;
  }
  return memories[0] || '';
}

async function getResellerApiForStock(stock) {
  if (!stock?.company) return null;
  const company = await Company.findById(stock.company).select('resellerApi name').lean();
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) return null;
  return {
    api: new ResellerApi(cfg),
    company,
    cfg,
  };
}

async function resolvePriceIds(api, stockCfg, memory) {
  let priceIds = resolvePriceIdsForMemory(stockCfg, memory);
  if (!priceIds?.cpuPriceId) {
    priceIds = await autoResolveResellerPriceIds(api, {
      memory,
      planType: stockCfg.planType,
    });
  }
  return priceIds;
}

/**
 * Check one RAM tier against panel wallet + zones.
 */
async function checkResellerVariantStock(api, { stockCfg, memory, ipStock }) {
  const priceIds = await resolvePriceIds(api, stockCfg, memory);
  const [wallet, pricing, activeZones, adminPool] = await Promise.all([
    api.getWallet(),
    api.estimateMonthlyVmPrice({
      planType: stockCfg.planType,
      cpuPriceId: priceIds.cpuPriceId,
      ramPriceId: priceIds.ramPriceId,
      diskPriceId: priceIds.diskPriceId,
      bandwidthPriceId: priceIds.bandwidthPriceId,
      months: 1,
      quantity: 1,
    }),
    api.getActiveZoneCount(),
    api.getAdminAvailableVms().catch(() => ({ ok: false, forbidden: true, count: null })),
  ]);

  const balance = Number(wallet?.balance ?? 0) || 0;
  const estimatedPrice = Number(pricing?.estimatedMonthly ?? 0) || 0;
  const zoneOk = activeZones > 0;
  const walletOk = estimatedPrice > 0 ? balance >= estimatedPrice : balance > 0;
  const adminOk = adminPool?.ok && adminPool.count > 0;

  const available = zoneOk && (walletOk || adminOk);
  const unitsAvailable = estimatedPrice > 0
    ? Math.max(0, Math.floor(balance / estimatedPrice))
    : (balance > 0 ? 1 : 0);

  let reason = '';
  if (!zoneOk) reason = 'No active zones on panel';
  else if (!walletOk && !adminOk) {
    reason = `Insufficient panel wallet (need ~₹${estimatedPrice.toFixed(2)}, have ₹${balance.toFixed(2)})`;
  }

  return {
    memory,
    available,
    walletBalance: balance,
    estimatedPrice,
    unitsAvailable,
    zoneOk,
    activeZones,
    adminPoolCount: adminPool?.count,
    adminPoolForbidden: !!adminPool?.forbidden,
    priceIds,
    reason: available ? '' : reason,
    message: available ? 'In stock (panel wallet OK)' : reason,
    checkedAt: new Date().toISOString(),
  };
}

async function syncResellerIpStockRow(stock, { force = false, memoryOnly = null } = {}) {
  if (!isResellerIpStock(stock) || !stockHasResellerPanelPlans(stock)) return stock;

  const ctx = await getResellerApiForStock(stock);
  if (!ctx) return stock;

  const company = ctx.company;
  if (!companyUsesResellerLiveStock(company)) return stock;

  const defaults = toPlainConfigurations(stock.defaultConfigurations) || {};
  const prevReseller = defaults.resellerApi || {};
  if (!force && isRecentStockSync(prevReseller.lastStockSync, STOCK_ROW_TTL_MS)) {
    return stock;
  }

  const stockCfg = readResellerApiStockConfig(stock);
  const memories = Object.keys(stock.memoryOptions || {}).filter(Boolean);
  if (memories.length === 0) {
    memories.push('4GB', '2GB', '8GB');
  }

  const memoriesToCheck = memoryOnly
    ? memories.filter((m) => m === memoryOnly)
    : [pickPrimaryMemory(memories)].filter(Boolean);

  const variantResults = { ...(prevReseller.variantStock || {}) };
  let upstreamYes = 0;
  let upstreamNo = 0;

  for (const memory of memoriesToCheck) {
    try {
      const result = await checkResellerVariantStock(ctx.api, { stockCfg, memory, ipStock: stock });
      variantResults[memory] = result;
      if (result.available) upstreamYes += 1;
      else upstreamNo += 1;
    } catch (err) {
      console.warn(`${LOG} check failed for ${stock.name} ${memory}:`, err.message);
      const prev = prevReseller.variantStock?.[memory];
      if (prev?.available === true && isRecentStockSync(prevReseller.lastStockSync)) {
        variantResults[memory] = { ...prev, checkedAt: new Date().toISOString() };
        upstreamYes += 1;
      } else {
        variantResults[memory] = {
          available: false,
          skipped: true,
          reason: err.message,
          checkedAt: new Date().toISOString(),
        };
        upstreamNo += 1;
      }
    }
  }

  // Mirror primary tier to all RAM options on listing sync
  if (!memoryOnly && memoriesToCheck.length === 1) {
    const primary = memoriesToCheck[0];
    const primaryResult = variantResults[primary];
    if (primaryResult) {
      for (const memory of memories) {
        if (memory === primary) continue;
        variantResults[memory] = { ...primaryResult, memory, mirroredFrom: primary };
      }
    }
  }

  const shouldAvailable = upstreamYes > 0;
  const maxUnits = Object.values(variantResults)
    .map((v) => Number(v?.unitsAvailable) || 0)
    .reduce((a, b) => Math.max(a, b), 0);

  const updatePayload = {
    defaultConfigurations: {
      ...defaults,
      resellerApi: {
        ...stockCfg,
        lastStockSync: new Date().toISOString(),
        variantStock: variantResults,
      },
    },
  };

  if (!stock.availabilityManual) {
    updatePayload.available = shouldAvailable;
  }
  if (usesResellerLiveStock(stock, company)) {
    updatePayload.stockCount = shouldAvailable ? Math.max(1, maxUnits) : 0;
  }

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id);
}

async function verifyResellerMemoryInStock(stock, memory, { preferCache = false } = {}) {
  if (!isResellerIpStock(stock)) return { ok: true, skipped: true };

  const ctx = await getResellerApiForStock(stock);
  if (!ctx) {
    return { ok: false, message: 'Unable to verify stock right now. Please refresh and try again.' };
  }

  const company = ctx.company;
  if (!companyUsesResellerLiveStock(company)) {
    return { ok: true, skipped: true, manual: true };
  }

  const defaults = toPlainConfigurations(stock.defaultConfigurations)?.resellerApi || {};
  const cached = defaults.variantStock?.[memory];
  const cacheFresh = isRecentStockSync(defaults.lastStockSync);

  if (preferCache && cacheFresh && cached?.available === true) {
    return { ok: true, result: cached, fromCache: true };
  }

  try {
    const stockCfg = readResellerApiStockConfig(stock);
    const result = await checkResellerVariantStock(ctx.api, {
      stockCfg,
      memory,
      ipStock: stock,
    });

    if (!result.available) {
      return {
        ok: false,
        message: result.reason || result.message || 'Panel wallet too low for this plan. Top up primevm.in wallet.',
        result,
      };
    }

    return { ok: true, result };
  } catch (err) {
    if (cacheFresh && cached?.available === true) {
      return { ok: true, result: cached, fromCache: true };
    }
    return { ok: false, message: err.message || 'Unable to verify stock right now' };
  }
}

async function refreshResellerStockForCustomer({ force = false } = {}) {
  if (!global.resellerCustomerRefresh) {
    global.resellerCustomerRefresh = { lastAt: 0, lastResult: null };
  }
  const cache = global.resellerCustomerRefresh;
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
  const companyIds = [...new Set(candidates.filter(isResellerIpStock).map((r) => String(r.company)))];
  const companies = companyIds.length
    ? await Company.find({ _id: { $in: companyIds } }).select('resellerApi').lean()
    : [];
  const liveCompanyIds = new Set(
    companies.filter(companyUsesResellerLiveStock).map((c) => String(c._id))
  );
  const rows = candidates.filter(
    (r) => liveCompanyIds.has(String(r.company)) && stockHasResellerPanelPlans(r)
  );

  let synced = 0;
  let inStock = 0;
  for (const row of rows) {
    try {
      const updated = await syncResellerIpStockRow(row, { force: true });
      synced += 1;
      if (updated?.available) inStock += 1;
    } catch (err) {
      console.warn(`${LOG} refresh row failed (${row.name}):`, err.message);
    }
  }

  const result = {
    success: true,
    synced,
    inStock,
    total: rows.length,
    refreshedAt: now,
  };
  cache.lastAt = now;
  cache.lastResult = result;
  return result;
}

async function restoreResellerManualStockAvailability(companyId) {
  const stocks = await IPStock.find({ company: companyId });
  for (const stock of stocks) {
    if (!isResellerIpStock(stock)) continue;
    const count = Math.max(0, Number(stock.stockCount) || 0);
    await IPStock.findByIdAndUpdate(stock._id, {
      available: count > 0,
    });
  }
}

module.exports = {
  isResellerIpStock,
  stockHasResellerPanelPlans,
  syncResellerIpStockRow,
  verifyResellerMemoryInStock,
  refreshResellerStockForCustomer,
  restoreResellerManualStockAvailability,
  checkResellerVariantStock,
};
