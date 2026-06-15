import IPStock from '@/models/ipStockModel';
import {
  getCurrentListPriceFromStock,
  getOrderRenewalPrice,
} from '@/lib/orderRenewalPricing';

/** Load live list price from the order's IP stock + memory tier. */
export async function getCurrentListPriceForOrder(order) {
  if (!order?.ipStockId || !order?.memory) return null;

  try {
    const ipStock = await IPStock.findById(order.ipStockId).lean();
    return getCurrentListPriceFromStock(ipStock, order.memory);
  } catch {
    return null;
  }
}

/** Server-side renewal price using live IP stock rate when available. */
export async function resolveOrderRenewalPrice(order) {
  const currentListPrice = await getCurrentListPriceForOrder(order);
  return getOrderRenewalPrice(order, currentListPrice);
}
