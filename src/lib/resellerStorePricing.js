import User from '@/models/userModel';
import Reseller from '@/models/resellerModel';
import { calculateResellerPlanPrice, memoryOptionsToObject } from '@/lib/resellerOrderApi';

function fallbackKeysForStock(stock, options) {
  const { isNetbayProxyStock, pickPricedMemoryKey } = require('@/lib/netbayGroupTags');
  if (!isNetbayProxyStock(stock)) return [];
  return [pickPricedMemoryKey(options), '4GB', 'proxy', 'slot'].filter(Boolean);
}

export async function getResellerForUserId(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select('userType resellerId').lean();
  if (!user || user.userType !== 'reseller' || !user.resellerId) return null;
  const reseller = await Reseller.findById(user.resellerId).select('pricing status').lean();
  if (!reseller || reseller.status === 'suspended') return null;
  return reseller;
}

export async function getResellerFromRequest(request) {
  try {
    const { getDataFromTokenSafe } = await import('@/helper/getDataFromToken');
    const userId = getDataFromTokenSafe(request);
    return getResellerForUserId(userId);
  } catch {
    return null;
  }
}

export function resellerPriceForStockMemory(reseller, stock, memory, basePrice) {
  const options = memoryOptionsToObject(stock?.memoryOptions);
  return calculateResellerPlanPrice(
    reseller,
    String(stock._id),
    memory,
    Number(basePrice) || 0,
    { fallbackMemoryKeys: fallbackKeysForStock(stock, options) },
  );
}

export function resellerPriceForSlot(reseller, pkg, basePrice) {
  return calculateResellerPlanPrice(
    reseller,
    String(pkg._id),
    'slot',
    Number(basePrice) || 0,
  );
}

export function applyResellerPricingToStock(stock, reseller) {
  if (!stock || !reseller) return stock;
  const options = memoryOptionsToObject(stock.memoryOptions);
  const next = {};
  for (const [key, details] of Object.entries(options || {})) {
    if (!details) continue;
    const listPrice = Number(details.price) || 0;
    const price = listPrice > 0
      ? resellerPriceForStockMemory(reseller, stock, key, listPrice)
      : listPrice;
    next[key] = { ...details, price, listPrice };
  }
  return { ...stock, memoryOptions: next, resellerPriced: true };
}

export function applyResellerPricingToSlot(pkg, reseller) {
  if (!pkg || !reseller) return pkg;
  const listPrice = Number(pkg.price) || 0;
  const price = resellerPriceForSlot(reseller, pkg, listPrice);
  return {
    ...pkg,
    listPrice,
    price,
    resellerPriced: true,
  };
}

export function applyResellerPricingToStocks(stocks, reseller) {
  if (!reseller || !Array.isArray(stocks)) return stocks;
  return stocks.map((stock) => applyResellerPricingToStock(stock, reseller));
}
