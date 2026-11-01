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
} = require('@/lib/nexaCatalogHelpers');

const SYNC_TTL_MS = 60_000;
const SYNC_TTL_PEAK_MS = 90_000;
const CUSTOMER_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

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
  if (live.available) {
    Object.assign(patch, storeAutoUnhideUpdate(stock, true));
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

/** Add new Nexa pools under plans we already sell (or bootstrap in-stock pools). */
async function importMissingNexaPools(companyId, plans, existingStocks, IPStock) {
  const keys = existingKeySet(existingStocks);
  let created = 0;

  const shouldAutoAdd = (plan, pool, live) => {
    const planId = Number(plan.planId);
    if (!planId) return false;
    const key = nexaStockKey(planId, pool?.poolId);
    if (keys.has(key)) return false;
    return live.available;
  };

  for (const plan of plans) {
    const poolList = plan.pools?.length ? plan.pools : [null];
    for (const pool of poolList) {
      if (pool && (pool.poolId == null || pool.poolId === '')) continue;
      const live = unitsFromNexaPoolAndPlan(pool, plan);
      if (!shouldAutoAdd(plan, pool, live)) continue;
      const doc = buildNexaStockDocument(companyId, plan, pool, live);
      await IPStock.create(doc);
      keys.add(nexaStockKey(plan.planId, pool?.poolId));
      created += 1;
    }
  }
  return created;
}

async function applyNexaLiveToStock(IPStock, stock, live, plan, pool) {
  const patch = nexaStoreVisibilityPatch(stock, live);
  const customerPrice = nexaStoreSellPrice(pool, plan);
  if (!patchNeedsApply(stock, patch, customerPrice)) return false;

  const iso = new Date().toISOString();
  const cfg = { ...nexaConfig(stock) };
  if (pool?.poolId != null) cfg.poolId = Number(pool.poolId);
  if (pool?.subnet) cfg.subnet = pool.subnet;
  cfg.lastStockSync = iso;
  cfg.livePoolStock = live.stockCount;
  cfg.liveInStock = live.available;
  if (customerPrice > 0) cfg.regularPrice = customerPrice;
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
  if (customerPrice > 0) {
    $set['memoryOptions.IP'] = { price: customerPrice };
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
    const pool = plan.pools.find((p) => String(p.subnet || '').trim().toLowerCase() === subnet);
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
