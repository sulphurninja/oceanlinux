import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  getCurrentListPriceFromStock,
  getOrderRenewalPrice,
  extractIpPrefixFromLabel,
  labelContainsIpPrefix,
} from '@/lib/orderRenewalPricing';

/**
 * Resolve the IP stock + list price to use for renewal.
 * When order.productName says "192.232.xx" but ipStockId still points at an old
 * "74.0.xx" product, prefer the stock whose name matches the order's IP prefix.
 */
export async function resolveRenewalIpStockForOrder(order) {
  if (!order?.memory) {
    return { stock: null, listPrice: null, correctedFrom: null };
  }

  let linked = null;
  if (order.ipStockId) {
    try {
      linked = await IPStock.findById(order.ipStockId).lean();
    } catch {
      linked = null;
    }
  }

  const productPrefix = extractIpPrefixFromLabel(order.productName);
  if (!linked || !productPrefix) {
    return {
      stock: linked,
      listPrice: getCurrentListPriceFromStock(linked, order.memory),
      correctedFrom: null,
    };
  }

  const linkedPrefix = extractIpPrefixFromLabel(linked.name);
  if (linkedPrefix === productPrefix) {
    return {
      stock: linked,
      listPrice: getCurrentListPriceFromStock(linked, order.memory),
      correctedFrom: null,
    };
  }

  // Product line renamed / re-listed — find the current stock for this IP range.
  const escaped = productPrefix.replace(/\./g, '\\.');
  const candidates = await IPStock.find({
    company: linked.company,
    name: { $regex: new RegExp(escaped, 'i') },
  }).lean();

  let best = null;
  let bestPrice = null;
  for (const candidate of candidates) {
    if (!labelContainsIpPrefix(candidate.name, productPrefix)) continue;
    const price = getCurrentListPriceFromStock(candidate, order.memory);
    if (price == null || price <= 0) continue;
    // Prefer exact prefix match; among equals pick highest current list price (latest rate)
    const exact = extractIpPrefixFromLabel(candidate.name) === productPrefix;
    const score = (exact ? 1_000_000 : 0) + price;
    if (!best || score > ((extractIpPrefixFromLabel(best.name) === productPrefix ? 1_000_000 : 0) + (bestPrice || 0))) {
      best = candidate;
      bestPrice = price;
    }
  }

  if (best) {
    return {
      stock: best,
      listPrice: bestPrice,
      correctedFrom: linked._id,
    };
  }

  return {
    stock: linked,
    listPrice: getCurrentListPriceFromStock(linked, order.memory),
    correctedFrom: null,
  };
}

/** Permanently point order at the correct product stock when name/IP prefix mismatches. */
export async function ensureOrderRenewalStockLink(order) {
  if (!order?._id) return { updated: false, stock: null };

  const resolved = await resolveRenewalIpStockForOrder(order);
  const newId = resolved.stock?._id ? String(resolved.stock._id) : null;
  const oldId = order.ipStockId ? String(order.ipStockId) : null;

  if (newId && oldId && newId !== oldId && resolved.correctedFrom) {
    await Order.findByIdAndUpdate(order._id, { ipStockId: newId });
    order.ipStockId = newId;
    console.log(
      `[RENEWAL-STOCK] Re-linked order ${order._id} (${order.ipAddress || 'no-ip'}): ` +
      `${oldId} → ${newId} (${resolved.stock.name}, ₹${resolved.listPrice}/${order.memory})`
    );
    return { updated: true, stock: resolved.stock, listPrice: resolved.listPrice };
  }

  return { updated: false, stock: resolved.stock, listPrice: resolved.listPrice };
}

/** Load live list price — uses product-name match when ipStockId is stale. */
export async function getCurrentListPriceForOrder(order) {
  const { listPrice } = await resolveRenewalIpStockForOrder(order);
  return listPrice;
}

/** Server-side renewal price using live IP stock rate when available. */
export async function resolveOrderRenewalPrice(order) {
  await ensureOrderRenewalStockLink(order);
  const currentListPrice = await getCurrentListPriceForOrder(order);
  const renewalPrice = getOrderRenewalPrice(order, currentListPrice);
  console.log(
    `[RENEWAL-PRICE] order ${order._id} (${order.ipAddress || 'no-ip'}): ` +
    `₹${renewalPrice} = currentList ₹${currentListPrice ?? 'locked'} − promo ₹${order.promoDiscount ?? 0}`
  );
  return renewalPrice;
}

/** Verify renewal formula across active orders (audit). */
export async function auditRenewalPricing({ limit = 2000 } = {}) {
  const orders = await Order.find({
    ipStockId: { $exists: true, $nin: [null, ''] },
    status: { $in: ['active', 'confirmed'] },
  })
    .select('_id ipStockId productName memory ipAddress promoDiscount promoCode originalPrice price')
    .limit(limit)
    .lean();

  let ok = 0;
  let staleLink = 0;
  let noLivePrice = 0;
  const samples = [];

  for (const order of orders) {
    const resolved = await resolveRenewalIpStockForOrder(order);
    const renewal = getOrderRenewalPrice(order, resolved.listPrice);
    const needsRelink =
      resolved.correctedFrom &&
      String(resolved.stock?._id) !== String(order.ipStockId);

    if (resolved.listPrice == null) {
      noLivePrice++;
    } else if (needsRelink) {
      staleLink++;
      if (samples.length < 10) {
        samples.push({
          ipAddress: order.ipAddress,
          issue: 'stale_stock_link',
          currentListPrice: resolved.listPrice,
          promoDiscount: Number(order.promoDiscount) || 0,
          renewalPrice: renewal,
        });
      }
    } else {
      ok++;
    }
  }

  return {
    total: orders.length,
    ok,
    staleLink,
    noLivePrice,
    formula: 'renewal = currentListPrice − promoDiscount (promo locked from first purchase)',
    samples,
  };
}

/** Bulk-fix orders whose ipStockId no longer matches their product IP prefix. */
export async function fixAllRenewalStockLinks({ dryRun = false, limit = 5000 } = {}) {
  const batchSize = 500;
  const results = [];
  let skip = 0;

  while (results.length < limit) {
    const orders = await Order.find({
      ipStockId: { $exists: true, $nin: [null, ''] },
      status: { $in: ['active', 'confirmed'] },
    })
      .select('_id ipStockId productName memory ipAddress price promoDiscount promoCode originalPrice')
      .skip(skip)
      .limit(batchSize)
      .lean();

    if (orders.length === 0) break;

    for (const order of orders) {
      if (results.length >= limit) break;
      const resolved = await resolveRenewalIpStockForOrder(order);
      const newId = resolved.stock?._id ? String(resolved.stock._id) : null;
      const oldId = order.ipStockId ? String(order.ipStockId) : null;

      if (newId && oldId && newId !== oldId && resolved.correctedFrom) {
        if (!dryRun) {
          await Order.findByIdAndUpdate(order._id, { ipStockId: newId });
        }
        results.push({
          orderId: String(order._id),
          ipAddress: order.ipAddress || '',
          productName: order.productName,
          oldStockId: oldId,
          newStockId: newId,
          newStockName: resolved.stock?.name,
          currentListPrice: resolved.listPrice,
          promoDiscount: Number(order.promoDiscount) || 0,
          newRenewalPrice: getOrderRenewalPrice(order, resolved.listPrice),
          fixed: !dryRun,
        });
      }
    }

    skip += batchSize;
    if (orders.length < batchSize) break;
  }

  return { count: results.length, results };
}
