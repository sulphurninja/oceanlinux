import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  usesPreconfiguredInventory,
  countUnallocatedInventory,
} from '@/lib/companyInventory';

/** Company-linked IP stocks use numeric inventory; others use the legacy boolean. */
export function usesStockCount(stock) {
  return !!(stock?.company);
}

export function getIpStockRemaining(stock) {
  if (!stock) return 0;
  if (usesPreconfiguredInventory(stock)) {
    return countUnallocatedInventory(stock);
  }
  if (usesStockCount(stock)) {
    return Math.max(0, Number(stock.stockCount) || 0);
  }
  return stock.available ? Number.POSITIVE_INFINITY : 0;
}

export function isIpStockPurchasable(stock, quantity = 1) {
  if (!stock) return false;
  if (usesStockCount(stock)) {
    return getIpStockRemaining(stock) >= quantity;
  }
  return !!stock.available;
}

export function syncAvailableFromStockCount(stock) {
  if (usesStockCount(stock)) {
    return getIpStockRemaining(stock) > 0;
  }
  return !!stock.available;
}

export async function assertIpStockPurchasable(ipStockId, quantity = 1) {
  const stock = await IPStock.findById(ipStockId);
  if (!stock) {
    return { ok: false, message: 'Product not found' };
  }
  if (!isIpStockPurchasable(stock, quantity)) {
    return {
      ok: false,
      message: usesStockCount(stock) ? 'This product is out of stock' : 'This product is currently out of stock',
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
  if (!stock || !usesStockCount(stock)) {
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
  return IPStock.findByIdAndUpdate(
    stockId,
    { stockCount: count, available: count > 0 },
    { new: true }
  );
}
