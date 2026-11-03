import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  usesCompanyInventoryFulfillment,
  usesCompanyUnitFulfillment,
  countUnallocatedInventory,
  hasUnallocatedCompanyInventory,
  usesPreconfiguredInventory,
  inventoryDrivesStoreAvailability,
} from '@/lib/companyInventory';

/** IP stock has Netbay plan IDs configured (automation), regardless of stock mode. */
export function stockHasNetbayPlans(stock) {
  if (!stock?.company) return false;
  let cfg = stock?.defaultConfigurations?.netbay;
  if (!cfg && typeof stock?.defaultConfigurations?.get === 'function') {
    cfg = stock.defaultConfigurations.get('netbay');
  }
  const plans = cfg?.planByMemory;
  if (!plans) return false;
  const obj = plans instanceof Map ? Object.fromEntries(plans) : plans;
  return Object.values(obj || {}).some(Boolean);
}

/** IP stock has reseller panel buy config (PrimeVPS / Hostheaven tag or block). */
export function stockHasResellerPanelPlans(stock) {
  if (!stock?.company) return false;
  let cfg = stock?.defaultConfigurations?.resellerApi;
  if (!cfg && typeof stock?.defaultConfigurations?.get === 'function') {
    cfg = stock.defaultConfigurations.get('resellerApi');
  }
  if (cfg && typeof cfg === 'object') return true;
  const tags = (stock?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('reseller-api') || tags.includes('primevps') || tags.includes('primevm');
}

/**
 * Reseller-panel plans with live wallet/pricing sync (company.resellerApi.useLiveStockApi).
 */
export function usesResellerLiveStock(stock, company) {
  if (!stockHasResellerPanelPlans(stock)) return false;
  if (!company) return false;
  if (!company?.resellerApi?.enabled) return false;
  return company.resellerApi.useLiveStockApi === true;
}

/**
 * Plan follows PrimeVPS/Hostheaven panel for store availability (wallet live-sync OR zone mapped on stock).
 */
export function usesResellerPanelLiveStock(stock, company) {
  if (!stockHasResellerPanelPlans(stock)) return false;
  if (!company?.resellerApi?.enabled) return false;
  if (usesResellerLiveStock(stock, company)) return true;
  const { readResellerApiStockConfig } = require('@/lib/resellerApiStockConfig');
  const cfg = readResellerApiStockConfig(stock);
  return (
    (Array.isArray(cfg.zoneIds) && cfg.zoneIds.length > 0) ||
    (cfg.zoneId != null && Number.isFinite(Number(cfg.zoneId)))
  );
}

/** IP stock has HostDzire inventory_key configured for place_order auto-buy. */
export function stockHasHostdzirePlans(stock) {
  const { stockHasHostdzirePlans: hasPlans } = require('@/lib/hostdzireStockConfig');
  return hasPlans(stock);
}

/** IP stock has KuroHost zone + flavor mapping for auto-buy. */
export function stockHasKurohostPlans(stock) {
  const { stockHasKurohostPlans: hasPlans } = require('@/lib/kurohostStockConfig');
  return hasPlans(stock);
}

/**
 * KuroHost zone = stock. When cloudZoneId is set on the plan and company
 * KuroHost is enabled, availability follows GET /zones (not manual stockCount).
 */
export function usesKurohostLiveStock(stock, company) {
  if (!stockHasKurohostPlans(stock)) return false;
  if (!company?.kurohostApi?.enabled) return false;
  const { readKurohostStockConfig } = require('@/lib/kurohostStockConfig');
  const cfg = readKurohostStockConfig(stock);
  return !!(cfg.cloudZoneId || (cfg.zoneIds?.length ?? 0) > 0);
}

/**
 * Netbay-linked plans with live API stock mode (company.netbayApi.useLiveStockApi).
 * When company is omitted, defaults to manual stockCount mode.
 */
export function usesNetbayLiveStock(stock, company) {
  if (!stockHasNetbayPlans(stock)) return false;
  if (!company) return false;
  if (!company?.netbayApi?.enabled) return false;
  return company.netbayApi.useLiveStockApi === true;
}

/**
 * HostDzire inventory_key plans with live qty sync (company.hostdzireApi.useLiveStockApi).
 */
export function usesHostdzireLiveStock(stock, company) {
  if (!stockHasHostdzirePlans(stock)) return false;
  if (!company) return false;
  if (!company?.hostdzireApi?.enabled) return false;
  return company.hostdzireApi.useLiveStockApi === true;
}

/** Company-linked IP stocks use numeric inventory; live API stock plans do not. */
export function usesStockCount(stock, company) {
  if (usesCompanyUnitFulfillment(stock)) return true;
  if (usesNetbayLiveStock(stock, company)) return false;
  if (usesHostdzireLiveStock(stock, company)) return false;
  if (usesKurohostLiveStock(stock, company)) return false;
  if (usesResellerPanelLiveStock(stock, company)) return false;
  return !!(stock?.company);
}

export function getIpStockRemaining(stock, company) {
  if (!stock) return 0;
  // Company owner saved manual Units — do not replace with inventory row count or live panel.
  if (usesCompanyUnitFulfillment(stock)) {
    return Math.max(0, Number(stock.stockCount) || 0);
  }
  // Saved VPS rows are the source of truth — never show stale stockCount when inventory is empty.
  if (usesPreconfiguredInventory(stock) && inventoryDrivesStoreAvailability(stock)) {
    return countUnallocatedInventory(stock);
  }
  if (hasUnallocatedCompanyInventory(stock)) {
    return countUnallocatedInventory(stock);
  }
  if (stock?.company && company) {
    const { isCompanyStockPurchasable } = require('@/lib/companyInventory');
    if (
      usesResellerPanelLiveStock(stock, company) ||
      usesNetbayLiveStock(stock, company) ||
      usesHostdzireLiveStock(stock, company) ||
      usesKurohostLiveStock(stock, company)
    ) {
      return isCompanyStockPurchasable(stock, company) ? Number.POSITIVE_INFINITY : 0;
    }
  }
  if (usesCompanyInventoryFulfillment(stock, company)) {
    return countUnallocatedInventory(stock);
  }
  if (usesStockCount(stock, company)) {
    return Math.max(0, Number(stock.stockCount) || 0);
  }
  return stock.available ? Number.POSITIVE_INFINITY : 0;
}

export function isIpStockHiddenFromStore(stock) {
  // Local buy tests can see Nexa plans. The database flag stays set so the live site does not list them.
  if (process.env.NODE_ENV !== 'production') {
    const tags = Array.isArray(stock?.tags) ? stock.tags : [];
    if (tags.some((tag) => String(tag).toLowerCase() === 'nexa')) return false;
  }
  return !!stock?.hiddenFromStore;
}

/** Restore store listing when live stock returns after bulk "hide out of stock". */
export function storeAutoUnhideUpdate(stock, inStock) {
  if (!inStock || !stock?.autoHiddenFromStore) return {};
  try {
    const { stockNameRequiresMappedZone, readResellerApiStockConfig } = require('@/lib/resellerApiStockConfig');
    if (stockNameRequiresMappedZone(stock)) {
      const cfg = readResellerApiStockConfig(stock);
      const zoneMapped =
        (Array.isArray(cfg.zoneIds) && cfg.zoneIds.length > 0) ||
        (cfg.zoneId != null && Number.isFinite(Number(cfg.zoneId)));
      if (!zoneMapped) return {};
    }
  } catch {
    /* ignore */
  }
  return { hiddenFromStore: false, autoHiddenFromStore: false };
}

/** Bulk hide sets autoHiddenFromStore — relist only when the plan is genuinely purchasable. */
export async function relistAutoHiddenStocksNowInStock() {
  const Company = (await import('@/models/companyModel')).default;
  const candidates = await IPStock.find({
    autoHiddenFromStore: true,
    hiddenFromStore: true,
  }).lean();

  let relisted = 0;
  for (const stock of candidates) {
    let company = null;
    if (stock.company) {
      company = await Company.findById(stock.company)
        .select('resellerApi netbayApi kurohostApi hostdzireApi')
        .lean();
    }
    if (!isIpStockPurchasable(stock, 1, company)) continue;
    await IPStock.updateOne(
      { _id: stock._id },
      { $set: { hiddenFromStore: false, autoHiddenFromStore: false } }
    );
    relisted += 1;
  }
  return relisted;
}

export async function applyAutoStoreRelist(stockOrId, inStock) {
  if (!inStock) return;
  const id = stockOrId?._id ?? stockOrId;
  if (!id) return;
  await IPStock.updateOne(
    { _id: id, autoHiddenFromStore: true },
    { $set: { hiddenFromStore: false, autoHiddenFromStore: false } }
  );
}

export function isIpStockPurchasable(stock, quantity = 1, company) {
  if (!stock) return false;
  if (isIpStockHiddenFromStore(stock)) return false;
  if (stock?.company && company) {
    const { isCompanyStockPurchasable } = require('@/lib/companyInventory');
    return isCompanyStockPurchasable(stock, company, quantity);
  }
  if (usesStockCount(stock, company)) {
    return getIpStockRemaining(stock, company) >= quantity;
  }
  return !!stock.available;
}

export function syncAvailableFromStockCount(stock, company) {
  if (usesStockCount(stock, company)) {
    return getIpStockRemaining(stock, company) > 0;
  }
  return !!stock.available;
}

export async function assertIpStockPurchasable(ipStockId, quantity = 1) {
  const stock = await IPStock.findById(ipStockId);
  if (!stock) {
    return { ok: false, message: 'Product not found' };
  }
  let company = null;
  if (stock.company) {
    const Company = (await import('@/models/companyModel')).default;
    company = await Company.findById(stock.company).select('netbayApi resellerApi').lean();
  }
  if (!isIpStockPurchasable(stock, quantity, company)) {
    return {
      ok: false,
      message: usesStockCount(stock, company) ? 'This product is out of stock' : 'This product is currently out of stock',
      stock,
    };
  }
  return { ok: true, stock };
}

/**
 * Decrement company stock when an order is confirmed. Idempotent via
 * `order.inventoryDecremented`.
 */
export async function decrementIpStockForOrder(order) {
  if (!order?.ipStockId) return { success: true, skipped: true };
  if (order.inventoryDecremented) return { success: true, alreadyDone: true };

  const stock = await IPStock.findById(order.ipStockId).select('company stockCount').lean();
  let company = null;
  if (stock?.company) {
    const Company = (await import('@/models/companyModel')).default;
    company = await Company.findById(stock.company).select('netbayApi resellerApi').lean();
  }
  if (!stock || !usesStockCount(stock, company)) {
    return { success: true, skipped: true };
  }

  const updated = await IPStock.findOneAndUpdate(
    { _id: order.ipStockId, stockCount: { $gte: 1 } },
    { $inc: { stockCount: -1 } },
    { new: true }
  );

  if (!updated) {
    console.warn(`[IPSTOCK] Could not decrement stock for order ${order._id} — sold out`);
    return { success: false, reason: 'out_of_stock' };
  }

  updated.available = updated.stockCount > 0;
  Object.assign(updated, storeAutoUnhideUpdate(updated, updated.stockCount > 0));
  await updated.save();

  await Order.findByIdAndUpdate(order._id, { inventoryDecremented: true });
  return { success: true, remaining: updated.stockCount };
}

export async function setIpStockCount(stockId, stockCount) {
  const count = Math.max(0, Math.floor(Number(stockCount) || 0));
  const stock = await IPStock.findById(stockId).select('company').lean();
  const $set = { stockCount: count, available: count > 0 };
  if (stock?.company) {
    $set.availabilityManual = true;
  }
  await IPStock.collection.updateOne({ _id: stockId }, { $set });
  if (count > 0) {
    await applyAutoStoreRelist(stockId, true);
  }
  return IPStock.findById(stockId);
}

/** Set the same manual stock count on every plan linked to a company. */
export async function setAllCompanyIpStockCounts(companyId, stockCount, company) {
  const count = Math.max(0, Math.floor(Number(stockCount) || 0));
  const stocks = await IPStock.find({ company: companyId }).lean();
  const ids = stocks.filter((s) => usesStockCount(s, company)).map((s) => s._id);
  if (ids.length === 0) return [];

  await IPStock.collection.updateMany(
    { _id: { $in: ids } },
    { $set: { stockCount: count, available: count > 0, availabilityManual: true } }
  );
  if (count > 0) {
    await IPStock.updateMany(
      { _id: { $in: ids }, autoHiddenFromStore: true },
      { $set: { hiddenFromStore: false, autoHiddenFromStore: false } }
    );
  }
  return IPStock.find({ _id: { $in: ids } }).sort({ name: 1 });
}
