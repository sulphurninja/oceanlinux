const NexaApi = require('@/services/nexaApi');
const { getCompanyNexaApiConfig } = require('@/lib/companyNexaApi');

const SYNC_TTL_MS = 60_000;

/** Mirror of ipStockAvailability.storeAutoUnhideUpdate (avoid ESM import from this CJS module). */
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

function unitsFromPool(pool) {
  if (!pool) return { available: false, stockCount: 0 };
  const raw = pool.stock;
  const markedOut = pool.in_stock === false || raw === 0 || raw === '0';
  if (markedOut) return { available: false, stockCount: 0 };
  if (raw == null || raw === '' || String(raw).toLowerCase() === 'unlimited') {
    return { available: true, stockCount: 100 };
  }
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return { available: false, stockCount: 0 };
  return { available: true, stockCount: Math.min(100000, Math.floor(count)) };
}

/** Store listing for Nexa Proxy rows: hide when pool is empty, relist when stock returns. */
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

/**
 * Copy Nexa pool stock onto our IP rows and hide empty pools from the store.
 */
async function syncNexaStoreAvailability({ Company, IPStock } = {}) {
  if (!Company || !IPStock) return 0;
  const now = Date.now();
  if (global.__oceanNexaStockSync?.promise) return global.__oceanNexaStockSync.promise;
  if (now - (global.__oceanNexaStockSync?.at || 0) < SYNC_TTL_MS) return 0;

  const run = (async () => {
    const companies = await Company.find({ 'nexaApi.enabled': true }).select('nexaApi name').lean();
    let changed = 0;
    for (const company of companies) {
      const cfg = getCompanyNexaApiConfig(company);
      if (!cfg) continue;
      const api = new NexaApi(cfg);
      const payload = await api.getPlans();
      const byPool = new Map();
      for (const plan of Array.isArray(payload?.plans) ? payload.plans : []) {
        for (const pool of Array.isArray(plan.pools) ? plan.pools : []) {
          const poolId = pool.pool_id ?? pool.id;
          if (poolId == null || poolId === '') continue;
          byPool.set(String(poolId), unitsFromPool(pool));
        }
      }
      const stocks = await IPStock.find(nexaStockQueryForCompany(company._id))
        .select('available stockCount hiddenFromStore autoHiddenFromStore defaultConfigurations')
        .lean();
      for (const stock of stocks) {
        const poolId = nexaConfig(stock).poolId;
        if (poolId == null || poolId === '') continue;
        const live = byPool.get(String(poolId)) || { available: false, stockCount: 0 };
        const patch = nexaStoreVisibilityPatch(stock, live);
        if (!nexaStockNeedsSyncUpdate(stock, patch)) continue;
        await IPStock.updateOne({ _id: stock._id }, { $set: patch });
        changed += 1;
      }
    }
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

/** Always hits the Nexa plans API. Used immediately before Buy / checkout. */
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
  const api = new NexaApi(cfg);
  const payload = await api.getPlans();
  const poolId = nexaConfig(stock).poolId;
  let live = null;
  for (const plan of Array.isArray(payload?.plans) ? payload.plans : []) {
    for (const pool of Array.isArray(plan.pools) ? plan.pools : []) {
      if (String(pool.pool_id ?? pool.id) === String(poolId)) live = unitsFromPool(pool);
    }
  }
  if (!live) live = { available: false, stockCount: 0 };
  const patch = nexaStoreVisibilityPatch(stock, live);
  await IPStock.updateOne({ _id: stock._id }, { $set: patch });
  stock.available = patch.available;
  stock.stockCount = patch.stockCount;
  if ('hiddenFromStore' in patch) stock.hiddenFromStore = patch.hiddenFromStore;
  if ('autoHiddenFromStore' in patch) stock.autoHiddenFromStore = patch.autoHiddenFromStore;
  if (global.__oceanIpStockCatalog?.clear) global.__oceanIpStockCatalog.clear();
  global.__oceanNexaStockSync = { promise: null, at: 0 };
  return stock;
}

module.exports = {
  syncNexaStoreAvailability,
  refreshNexaStockForPurchase,
  unitsFromPool,
  nexaStoreVisibilityPatch,
  nexaStockQueryForCompany,
};
