import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  usesPreconfiguredInventory,
  countUnallocatedInventory,
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
 * Netbay-linked plans with live API stock mode (company.netbayApi.useLiveStockApi).
 * When company is omitted, defaults to manual stockCount mode.
 */
export function usesNetbayLiveStock(stock, company) {
  if (!stockHasNetbayPlans(stock)) return false;
  if (!company) return false;
  if (!company?.netbayApi?.enabled) return false;
  return company.netbayApi.useLiveStockApi === true;
}

/** Company-linked IP stocks use numeric inventory; live API stock plans do not. */
export function usesStockCount(stock, company) {
  if (usesNetbayLiveStock(stock, company)) return false;
  if (usesResellerLiveStock(stock, company)) return false;
  return !!(stock?.company);
}

export function getIpStockRemaining(stock, company) {
  if (!stock) return 0;
  if (usesPreconfiguredInventory(stock)) {
    return countUnallocatedInventory(stock);
  }
  if (usesStockCount(stock, company)) {
    return Math.max(0, Number(stock.stockCount) || 0);
  }
  return stock.available ? Number.POSITIVE_INFINITY : 0;
}

export function isIpStockHiddenFromStore(stock) {
  return !!stock?.hiddenFromStore;
}

export function isIpStockPurchasable(stock, quantity = 1, company) {
  if (!stock) return false;
  if (isIpStockHiddenFromStore(stock)) return false;
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
    company = await Company.findById(stock.company).select('netbayApi').lean();
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
  await updated.save();

  await Order.findByIdAndUpdate(order._id, { inventoryDecremented: true });
  return { success: true, remaining: updated.stockCount };
}

export async function setIpStockCount(stockId, stockCount) {
  const count = Math.max(0, Math.floor(Number(stockCount) || 0));
  await IPStock.collection.updateOne(
    { _id: stockId },
    { $set: { stockCount: count, available: count > 0 } }
  );
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
    { $set: { stockCount: count, available: count > 0 } }
  );
  return IPStock.find({ _id: { $in: ids } }).sort({ name: 1 });
}
