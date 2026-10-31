/**
 * Live PrimeVPS / Hostheaven panel stock.
 *
 * Per-plan mode (default when ipStock.defaultConfigurations.resellerApi.zoneId is set):
 *   GET /api/users/zones → that zone status ACTIVE/AVAILABLE = in stock.
 *   Each region (Mumbai-103.20, 103.148, …) syncs independently — no manual stockCount.
 *
 * Legacy mode (no zoneId on the plan):
 *   Wallet balance >= estimated monthly VM price + at least one active zone.
 */

const Company = require('@/models/companyModel').default;
const IPStock = require('@/models/ipStockModel');
const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig, companyUsesResellerLiveStock } = require('@/lib/companyResellerApi');
const {
  readResellerApiStockConfig,
  resolvePriceIdsForMemory,
  autoResolveResellerPriceIds,
  resolveEffectiveResellerPlanType,
  isResellerApiStock,
} = require('@/lib/resellerApiStockConfig');
const { usesResellerLiveStock } = require('@/lib/ipStockAvailability');
const { toPlainConfigurations, getIpStockMemoryKeys, sanitizeVariantStockMap } = require('@/lib/advpsLiveStock');

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

function memoryOptionPrice(stock, memory) {
  const mo = stock?.memoryOptions;
  if (!mo) return null;
  let entry = null;
  if (typeof mo.get === 'function') entry = mo.get(memory);
  else if (mo instanceof Map) entry = mo.get(memory);
  else entry = mo[memory];
  const price = entry?.price;
  return price != null && Number(price) > 0 ? Number(price) : null;
}

function pickPrimaryMemory(stock, memories) {
  const keys = memories || getIpStockMemoryKeys(stock);
  const priced = keys.filter((m) => memoryOptionPrice(stock, m) != null);
  const preferred = ['2GB', '4GB', '8GB', '1GB', '16GB'];
  const pool = priced.length ? priced : keys;
  for (const m of preferred) {
    if (pool.includes(m)) return m;
  }
  return pool[0] || '';
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

async function resolvePriceIds(api, stockCfg, memory, stock) {
  let priceIds = resolvePriceIdsForMemory(stockCfg, memory);
  if (!priceIds?.cpuPriceId) {
    const { isLinuxProductName } = require('@/lib/orderOs');
    priceIds = await autoResolveResellerPriceIds(api, {
      memory,
      planType: stockCfg.planType,
      isWindows: !isLinuxProductName(stock?.name),
    });
  }
  return priceIds;
}

/**
 * Zone-only stock follows the product's primary zone only.
 * Another region being live does not make this plan purchasable.
 */
async function checkResellerZoneStock(api, { stockCfg, memory, zonesList = null }) {
  const zoneIds = stockCfg?.zoneIds?.length
    ? stockCfg.zoneIds
    : stockCfg?.zoneId != null
      ? [Number(stockCfg.zoneId)]
      : [];
  const primaryId = zoneIds.length ? Number(zoneIds[0]) : null;

  const zones = zonesList || (await api.listZones());
  const zone = primaryId == null ? null : zones.find((z) => Number(z.id) === primaryId);
  const zoneOk = !!(zone && ResellerApi.isZoneStatusLive(zone.status));
  const zoneLabel = zone?.name || (primaryId != null ? `zone ${primaryId}` : 'zone');

  if (primaryId == null) {
    return {
      memory,
      available: false,
      stockMode: 'zone',
      zoneId: null,
      zoneOk: false,
      unitsAvailable: 0,
      reason: 'No region configured on this IP stock',
      message: 'Region not configured',
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    memory,
    available: zoneOk,
    stockMode: 'zone',
    zoneId: primaryId,
    zoneName: zone?.name || '',
    zoneIds: [primaryId],
    zoneStatus: zone?.status || null,
    zoneOk,
    unitsAvailable: zoneOk ? 1 : 0,
    fallbackZones: [
      zone
        ? { zoneId: zone.id, zoneName: zone.name, zoneStatus: zone.status, zoneOk }
        : { zoneId: primaryId, zoneOk: false, reason: `Region (zone ${primaryId}) not found on panel` },
    ],
    reason: zoneOk ? '' : `${zoneLabel} is inactive or missing on the panel`,
    message: zoneOk
      ? `In stock (${zoneLabel})`
      : `Out of stock (${zoneLabel} inactive)`,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Legacy wallet-based stock when plan has no zoneId.
 */
async function checkResellerWalletStock(api, { stockCfg, memory, stock = null }) {
  const priceIds = await resolvePriceIds(api, stockCfg, memory, stock);
  const planType = resolveEffectiveResellerPlanType(stockCfg, priceIds);
  const [wallet, pricing, activeZones, adminPool] = await Promise.all([
    api.getWallet(),
    api.estimateMonthlyVmPrice({
      planType,
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
    stockMode: 'wallet',
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

/**
 * Check one RAM tier — zone API when zoneId set, else wallet fallback.
 */
async function checkResellerVariantStock(api, { stockCfg, memory, zonesList = null, stock = null }) {
  if (
    (stockCfg?.zoneIds?.length ?? 0) > 0 ||
    (stockCfg?.zoneId != null && Number.isFinite(Number(stockCfg.zoneId)))
  ) {
    return checkResellerZoneStock(api, { stockCfg, memory, zonesList });
  }
  return checkResellerWalletStock(api, { stockCfg, memory, stock });
}

async function syncResellerIpStockRow(stock, { force = false, memoryOnly = null, zonesList = null } = {}) {
  if (!isResellerIpStock(stock) || !stockHasResellerPanelPlans(stock)) return stock;

  const ctx = await getResellerApiForStock(stock);
  if (!ctx) return stock;

  const company = ctx.company;

  const stockCfg = readResellerApiStockConfig(stock);
  const isZoneLiveStock =
    stockCfg.zoneId != null || (Array.isArray(stockCfg.zoneIds) && stockCfg.zoneIds.length > 0);

  // Zone plans follow panel ACTIVE/INACTIVE even when wallet live-sync is off.
  if (!companyUsesResellerLiveStock(company) && !isZoneLiveStock) return stock;

  // Zone-based PrimeVPS/Hostheaven stock must follow panel ACTIVE/INACTIVE — not manual units.
  if (isZoneLiveStock && stock.availabilityManual === true) {
    await IPStock.findByIdAndUpdate(stock._id, { availabilityManual: false });
    stock.availabilityManual = false;
  } else if (stock.availabilityManual === true) {
    const { applyAutoStoreRelist } = require('@/lib/ipStockAvailability');
    const count = Math.max(0, Number(stock.stockCount) || 0);
    await applyAutoStoreRelist(stock._id, count > 0 || stock.available === true);
    return IPStock.findById(stock._id).lean();
  }

  const defaults = toPlainConfigurations(stock.defaultConfigurations) || {};
  const prevReseller = defaults.resellerApi || {};
  if (!force && isRecentStockSync(prevReseller.lastStockSync, STOCK_ROW_TTL_MS)) {
    return stock;
  }

  let memories = getIpStockMemoryKeys(stock);
  if (memories.length === 0) {
    memories = ['4GB', '2GB', '8GB'];
  }

  const memoriesToCheck = memoryOnly
    ? [memoryOnly]
    : [pickPrimaryMemory(stock, memories)].filter(Boolean);

  let resolvedZones = zonesList;
  if (isZoneLiveStock && !resolvedZones) {
    try {
      resolvedZones = await ctx.api.listZones();
    } catch (err) {
      console.warn(`${LOG} listZones failed for ${stock.name}:`, err.message);
    }
  }

  const plainVariantStock = sanitizeVariantStockMap(
    prevReseller.variantStock && typeof prevReseller.variantStock === 'object'
      ? JSON.parse(JSON.stringify(prevReseller.variantStock))
      : {}
  );
  const variantResults = { ...plainVariantStock };
  let upstreamYes = 0;
  let upstreamNo = 0;
  let lastZoneName = prevReseller.zoneName || null;

  for (const memory of memoriesToCheck) {
    try {
      const result = await checkResellerVariantStock(ctx.api, {
        stockCfg,
        memory,
        zonesList: resolvedZones,
        stock,
      });
      variantResults[memory] = result;
      if (result.zoneName) lastZoneName = result.zoneName;
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

  if (!memoryOnly && memoriesToCheck.length === 1) {
    const primary = memoriesToCheck[0];
    const primaryResult = variantResults[primary];
    if (primaryResult && typeof primaryResult === 'object') {
      const plainPrimary = JSON.parse(JSON.stringify(primaryResult));
      for (const memory of memories) {
        if (memory === primary) continue;
        variantResults[memory] = { ...plainPrimary, memory, mirroredFrom: primary };
      }
    }
  }

  const shouldAvailable = upstreamYes > 0;
  const maxUnits = Object.values(variantResults)
    .map((v) => Number(v?.unitsAvailable) || 0)
    .reduce((a, b) => Math.max(a, b), 0);

  const primaryResult = variantResults[memoriesToCheck[0]] || {};

  const updatePayload = {
    defaultConfigurations: {
      ...defaults,
      resellerApi: {
        ...stockCfg,
        ...(lastZoneName ? { zoneName: lastZoneName } : {}),
        lastStockSync: new Date().toISOString(),
        lastStockMode: primaryResult.stockMode || (stockCfg.zoneId != null ? 'zone' : 'wallet'),
        variantStock: sanitizeVariantStockMap(variantResults),
      },
    },
  };

  if (!stock.availabilityManual) {
    const { hasUnallocatedCompanyInventory, countUnallocatedInventory } = require('@/lib/companyInventory');
    const invRemaining = hasUnallocatedCompanyInventory(stock) ? countUnallocatedInventory(stock) : 0;
    const hybridAvailable = shouldAvailable || invRemaining > 0;
    updatePayload.available = hybridAvailable;
    // Live panel stock: when region/zone is live, plan must show on the store.
    const { storeAutoUnhideUpdate } = require('@/lib/ipStockAvailability');
    Object.assign(updatePayload, storeAutoUnhideUpdate(stock, hybridAvailable));
  }
  // Manual override wins over panel zone status — owner set count by hand.
  if (usesResellerLiveStock(stock, company) && !stock.availabilityManual) {
    const { hasUnallocatedCompanyInventory, countUnallocatedInventory } = require('@/lib/companyInventory');
    const invRemaining = hasUnallocatedCompanyInventory(stock) ? countUnallocatedInventory(stock) : 0;
    updatePayload.stockCount =
      invRemaining > 0 ? invRemaining : shouldAvailable ? Math.max(1, maxUnits) : 0;
  }

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id);
}

async function verifyResellerMemoryInStock(stock, memory, { preferCache = false, zonesList = null } = {}) {
  if (!isResellerIpStock(stock)) return { ok: true, skipped: true };

  const { hasUnallocatedCompanyInventory } = require('@/lib/companyInventory');
  if (hasUnallocatedCompanyInventory(stock)) {
    return {
      ok: true,
      result: { available: true, stockMode: 'inventory', message: 'Saved VPS in stock' },
      fromInventory: true,
    };
  }

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
      zonesList,
      stock,
    });

    if (!result.available) {
      const defaultMsg = stockCfg.zoneId != null
        ? 'This region is currently unavailable on the panel.'
        : 'Panel wallet too low for this plan. Top up primevm.in wallet.';
      return {
        ok: false,
        message: result.reason || result.message || defaultMsg,
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

  const rowsByCompany = {};
  for (const row of rows) {
    const cid = String(row.company);
    if (!rowsByCompany[cid]) rowsByCompany[cid] = [];
    rowsByCompany[cid].push(row);
  }

  let synced = 0;
  let inStock = 0;
  const zoneSnapshots = [];

  for (const [companyId, companyRows] of Object.entries(rowsByCompany)) {
    let zonesList = null;
    try {
      const ctx = await getResellerApiForStock(companyRows[0]);
      if (ctx) {
        zonesList = await ctx.api.listZones();
        for (const z of zonesList) {
          zoneSnapshots.push({
            companyId,
            zoneId: z.id,
            name: z.name,
            status: z.status,
            live: ResellerApi.isZoneStatusLive(z.status),
          });
        }
      }
    } catch (err) {
      console.warn(`${LOG} listZones failed for company ${companyId}:`, err.message);
    }

    for (const row of companyRows) {
      try {
        const updated = await syncResellerIpStockRow(row, { force: true, zonesList });
        synced += 1;
        if (updated?.available) inStock += 1;
      } catch (err) {
        console.warn(`${LOG} refresh row failed (${row.name}):`, err.message);
      }
    }
  }

  const result = {
    success: true,
    synced,
    inStock,
    total: rows.length,
    zones: zoneSnapshots,
    refreshedAt: now,
  };
  cache.lastAt = now;
  cache.lastResult = result;
  try {
    const { relistAutoHiddenStocksNowInStock } = require('@/lib/ipStockAvailability');
    result.relisted = await relistAutoHiddenStocksNowInStock();
  } catch (err) {
    console.warn(`${LOG} auto-relist after refresh failed:`, err.message);
  }
  return result;
}

async function restoreResellerManualStockAvailability(companyId) {
  const stocks = await IPStock.find({ company: companyId });
  const { applyAutoStoreRelist } = require('@/lib/ipStockAvailability');
  for (const stock of stocks) {
    if (!isResellerIpStock(stock)) continue;
    const count = Math.max(0, Number(stock.stockCount) || 0);
    await IPStock.findByIdAndUpdate(stock._id, {
      available: count > 0,
    });
    if (count > 0) {
      await applyAutoStoreRelist(stock._id, true);
    }
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
