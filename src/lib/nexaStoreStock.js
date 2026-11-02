const NexaApi = require('@/services/nexaApi');
const { getCompanyNexaApiConfig } = require('@/lib/companyNexaApi');
const {
  mapPlansPayload,
  nexaStoreSellPrice,
  buildPoolStockMapFromPlans,
  resolveLiveForStock,
  nexaStockKey,
  buildNexaStockDocument,
  defaultNexaMemoryOptions,
  unitsFromNexaPoolAndPlan,
  subnetsMatch,
  buildNexaStockName,
} = require('@/lib/nexaCatalogHelpers');

const SYNC_TTL_MS = 60_000;
const SYNC_TTL_PEAK_MS = 90_000;
const CUSTOMER_REFRESH_INTERVAL_MS = 90_000;

function storeAutoUnhideUpdate(stock, inStock) {
  if (!inStock || !stock?.autoHiddenFromStore) return {};
  return { hiddenFromStore: false, autoHiddenFromStore: false };
}

function nexaConfig(stock) {
  const dc = stock?.defaultConfigurations;
  if (!dc) return {};
  if (typeof dc.get === 'function') return dc.get('nexa') || {};
  return dc.nexa || {};
}

function asConfigObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return typeof value === 'object' ? value : {};
}

/** Store listing for Nexa rows: hide when pool empty, relist when stock returns. */
function nexaStoreVisibilityPatch(stock, live) {
  const patch = {
    available: live.available,
    stockCount: live.stockCount,
  };
  const hasNexaPlan = Number(nexaConfig(stock).planId) > 0;
  if (live.available) {
    Object.assign(patch, storeAutoUnhideUpdate(stock, true));
    // Rows hidden while OOS often keep autoHiddenFromStore=false; still relist when Nexa has stock.
    if (hasNexaPlan && stock.hiddenFromStore) {
      patch.hiddenFromStore = false;
      patch.autoHiddenFromStore = false;
    }
  } else {
    patch.hiddenFromStore = true;
    patch.autoHiddenFromStore = true;
  }
  return patch;
}

function patchNeedsApply(stock, patch, price) {
  if (nexaStockNeedsSyncUpdate(stock, patch)) return true;
  const current = Number(stock.memoryOptions?.IP?.price ?? stock.memoryOptions?.get?.('IP')?.price);
  if (price > 0 && current !== price) return true;
  return false;
}

function nexaStockNeedsSyncUpdate(stock, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'stockCount') {
      if (Number(stock.stockCount) !== Number(value)) return true;
      continue;
    }
    if (key === 'hiddenFromStore' || key === 'autoHiddenFromStore') {
      if (Boolean(stock[key]) !== Boolean(value)) return true;
      continue;
    }
    if (Boolean(stock[key]) !== Boolean(value)) return true;
    if (stock[key] !== value && typeof value !== 'boolean') return true;
  }
  return false;
}

function nexaStockQueryForCompany(companyId) {
  return {
    company: companyId,
    $or: [
      { tags: 'nexa' },
      { 'defaultConfigurations.nexa.planId': { $exists: true, $ne: null } },
    ],
  };
}

function syncTtlMs() {
  try {
    const { isIstPeakTrafficHour } = require('@/lib/istPeakTraffic');
    return isIstPeakTrafficHour() ? SYNC_TTL_PEAK_MS : SYNC_TTL_MS;
  } catch {
    return SYNC_TTL_MS;
  }
}

function clearCatalogCaches() {
  if (global.__oceanIpStockCatalog?.clear) global.__oceanIpStockCatalog.clear();
  global.__oceanNexaStockSync = { promise: null, at: 0 };
}

function existingKeySet(existingStocks) {
  return new Set(
    existingStocks.map((stock) => {
      const nexa = nexaConfig(stock);
      return nexaStockKey(nexa.planId, nexa.poolId);
    })
  );
}

function soldNexaPlanIds(existingStocks) {
  const ids = new Set();
  for (const stock of existingStocks) {
    const planId = Number(nexaConfig(stock).planId);
    if (planId > 0) ids.add(planId);
  }
  return ids;
}

/** Fallback customer price from another subnet on the same Nexa plan (e.g. new Broadcast pool). */
function siblingNexaSellPrice(existingStocks, planId) {
  for (const stock of existingStocks) {
    const nexa = nexaConfig(stock);
    if (Number(nexa.planId) !== Number(planId)) continue;
    const fromMem = Number(stock.memoryOptions?.IP?.price ?? stock.memoryOptions?.get?.('IP')?.price);
    if (Number.isFinite(fromMem) && fromMem > 0) return Math.round(fromMem);
    const fromCfg = Number(nexa.regularPrice);
    if (Number.isFinite(fromCfg) && fromCfg > 0) return Math.round(fromCfg);
  }
  return 0;
}

function companyListsNexaInStore(existingStocks) {
  return existingStocks.some(
    (s) => Number(nexaConfig(s).planId) > 0 || (Array.isArray(s.tags) && s.tags.includes('nexa'))
  );
}

/** Add new in-stock Nexa pools (existing plan or brand-new plan when Nexa catalog is already live). */
async function importMissingNexaPools(companyId, plans, existingStocks, IPStock) {
  const keys = existingKeySet(existingStocks);
  const soldPlanIds = soldNexaPlanIds(existingStocks);
  const nexaLive = companyListsNexaInStore(existingStocks);
  let created = 0;

  const shouldAutoAdd = (plan, pool, live) => {
    const planId = Number(plan.planId);
    if (!planId) return false;
    const key = nexaStockKey(planId, pool?.poolId);
    if (keys.has(key)) return false;
    if (!live.available) return false;
    if (soldPlanIds.has(planId)) return true;
    return nexaLive;
  };

  for (const plan of plans) {
    const poolList = plan.pools?.length ? plan.pools : [null];
    for (const pool of poolList) {
      if (pool && (pool.poolId == null || pool.poolId === '')) continue;
      const live = unitsFromNexaPoolAndPlan(pool, plan);
      if (!shouldAutoAdd(plan, pool, live)) continue;
      let price = nexaStoreSellPrice(pool, plan);
      if (price <= 0) price = siblingNexaSellPrice(existingStocks, plan.planId);
      if (price <= 0) {
        console.warn(
          '[NEXA-IMPORT] skip pool (no user rate):',
          plan.planId,
          pool?.subnet || pool?.name || 'plan-only'
        );
        continue;
      }
      const doc = buildNexaStockDocument(companyId, plan, pool, live);
      doc.memoryOptions = defaultNexaMemoryOptions(price);
      doc.hiddenFromStore = false;
      doc.autoHiddenFromStore = false;
      doc.defaultConfigurations.nexa.regularPrice = price;
      await IPStock.create(doc);
      keys.add(nexaStockKey(plan.planId, pool?.poolId));
      created += 1;
      console.log('[NEXA-IMPORT] created store row:', doc.name, 'price', price, 'units', live.stockCount);
    }
  }
  return created;
}

async function applyNexaLiveToStock(IPStock, stock, live, plan, pool) {
  const patch = nexaStoreVisibilityPatch(stock, live);
  const customerPrice = nexaStoreSellPrice(pool, plan);
  const sellPrice =
    customerPrice > 0
      ? customerPrice
      : Number(stock.memoryOptions?.IP?.price ?? stock.memoryOptions?.get?.('IP')?.price) || 0;

  if (!patchNeedsApply(stock, patch, sellPrice || customerPrice)) {
    if (!(live.available && stock.hiddenFromStore && Number(nexaConfig(stock).planId) > 0)) {
      return false;
    }
  }

  const iso = new Date().toISOString();
  const cfg = { ...nexaConfig(stock) };
  if (pool?.poolId != null) cfg.poolId = Number(pool.poolId);
  if (pool?.subnet) cfg.subnet = pool.subnet;
  cfg.lastStockSync = iso;
  cfg.livePoolStock = live.stockCount;
  cfg.liveInStock = live.available;
  const priceForStore = sellPrice > 0 ? sellPrice : customerPrice;
  if (priceForStore > 0) cfg.regularPrice = priceForStore;
  if (pool?.apiPrice != null || plan?.apiPrice != null) {
    cfg.apiPrice = Number(pool?.apiPrice ?? plan?.apiPrice) || cfg.apiPrice || 0;
  }

  const $set = {
    available: patch.available,
    stockCount: patch.stockCount,
    'defaultConfigurations.nexa': cfg,
  };
  if (patch.hiddenFromStore != null) $set.hiddenFromStore = patch.hiddenFromStore;
  if (patch.autoHiddenFromStore != null) $set.autoHiddenFromStore = patch.autoHiddenFromStore;
  if (priceForStore > 0) {
    $set['memoryOptions.IP'] = { price: priceForStore };
  }
  if (plan?.planId) {
    const nextName = buildNexaStockName(plan, pool);
    if (nextName && nextName !== stock.name) $set.name = nextName;
  }

  await IPStock.updateOne({ _id: stock._id }, { $set });
  return true;
}

function findPlanPoolForStock(stock, plans) {
  const cfg = nexaConfig(stock);
  const plan = plans.find((p) => Number(p.planId) === Number(cfg.planId));
  if (!plan) return { plan: null, pool: null };
  if (cfg.poolId != null && cfg.poolId !== '') {
    const pool = (plan.pools || []).find((p) => Number(p.poolId) === Number(cfg.poolId));
    return { plan, pool: pool || null };
  }
  const subnet = String(cfg.subnet || '').trim().toLowerCase();
  if (subnet && plan.pools?.length) {
    const pool = plan.pools.find((p) => subnetsMatch(p.subnet, cfg.subnet));
    if (pool) return { plan, pool };
  }
  return { plan, pool: plan.pools?.[0] || null };
}

async function syncNexaStoreAvailability({ Company, IPStock, force = false } = {}) {
  if (!Company || !IPStock) return 0;
  const now = Date.now();
  if (global.__oceanNexaStockSync?.promise) return global.__oceanNexaStockSync.promise;
  if (!force && now - (global.__oceanNexaStockSync?.at || 0) < syncTtlMs()) return 0;

  const run = (async () => {
    const companies = await Company.find({ 'nexaApi.enabled': true }).select('nexaApi name').lean();
    let changed = 0;
    for (const company of companies) {
      const cfg = getCompanyNexaApiConfig(company);
      if (!cfg) continue;
      const api = new NexaApi(cfg);
      const payload = await api.getPlans();
      const plans = mapPlansPayload(payload);
      const { byPool } = buildPoolStockMapFromPlans(plans);

      let stocks = await IPStock.find(nexaStockQueryForCompany(company._id))
        .select('available stockCount hiddenFromStore autoHiddenFromStore defaultConfigurations memoryOptions name')
        .lean();

      const imported = await importMissingNexaPools(company._id, plans, stocks, IPStock);
      changed += imported;
      if (imported > 0) {
        stocks = await IPStock.find(nexaStockQueryForCompany(company._id))
          .select('available stockCount hiddenFromStore autoHiddenFromStore defaultConfigurations memoryOptions name')
          .lean();
      }

      for (const stock of stocks) {
        const cfgStock = nexaConfig(stock);
        if (!cfgStock.planId) continue;
        const live = resolveLiveForStock(stock, cfgStock, byPool, plans);
        const { plan, pool } = findPlanPoolForStock(stock, plans);
        const did = await applyNexaLiveToStock(IPStock, stock, live, plan || { planId: cfgStock.planId }, pool);
        if (did) changed += 1;
      }
    }
    if (changed > 0) clearCatalogCaches();
    return changed;
  })();

  global.__oceanNexaStockSync = { promise: run, at: now };
  try {
    const changed = await run;
    global.__oceanNexaStockSync = { promise: null, at: Date.now() };
    return changed;
  } catch (err) {
    global.__oceanNexaStockSync = { promise: null, at: 0 };
    throw err;
  }
}

async function refreshNexaStockForCustomer({ force = false } = {}) {
  if (!global.__oceanNexaCustomerRefresh) {
    global.__oceanNexaCustomerRefresh = { lastAt: 0, lastResult: null };
  }
  const cache = global.__oceanNexaCustomerRefresh;
  const now = Date.now();

  if (!force && cache.lastAt && now - cache.lastAt < CUSTOMER_REFRESH_INTERVAL_MS) {
    return {
      success: true,
      skipped: true,
      throttled: true,
      refreshedAt: cache.lastAt,
      nextRefreshInMs: CUSTOMER_REFRESH_INTERVAL_MS - (now - cache.lastAt),
      ...(cache.lastResult || {}),
    };
  }

  const connectDB = (await import('@/lib/db')).default;
  const Company = (await import('@/models/companyModel')).default;
  const IPStock = require('@/models/ipStockModel');

  await connectDB();
  const changed = await syncNexaStoreAvailability({ Company, IPStock, force: true });
  const result = { success: true, changed, refreshedAt: Date.now() };
  cache.lastAt = Date.now();
  cache.lastResult = result;
  return result;
}

async function refreshNexaStockForPurchase(stock, { Company, IPStock } = {}) {
  if (!stock || !Company || !IPStock) return stock;
  const company = stock.company
    ? await Company.findById(stock.company).select('nexaApi name').lean()
    : null;
  const cfg = getCompanyNexaApiConfig(company);
  if (!cfg) {
    const err = new Error('Nexa stock could not be checked');
    err.code = 'NEXA_STOCK_UNAVAILABLE';
    throw err;
  }
  await syncNexaStoreAvailability({ Company, IPStock, force: true });
  return IPStock.findById(stock._id).lean();
}

module.exports = {
  syncNexaStoreAvailability,
  refreshNexaStockForPurchase,
  refreshNexaStockForCustomer,
  nexaStoreVisibilityPatch,
  nexaStockQueryForCompany,
  nexaStoreSellPrice,
};
