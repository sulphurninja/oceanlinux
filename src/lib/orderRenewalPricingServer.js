import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  getCurrentListPriceFromStock,
  getOrderRenewalPrice,
  extractIpPrefixFromLabel,
  labelContainsIpPrefix,
} from '@/lib/orderRenewalPricing';
import { isNetbayProxyOrder, isNetbayProxyStock } from '@/lib/netbayGroupTags';

/** "Dynamic Multi-IP - 163.227" → catalogue name. The suffix is a range, not a RAM tier. */
function proxyCatalogueName(productName) {
  return String(productName || '')
    .replace(/\s+-\s+\d{1,3}(?:\.\d{1,3}){1,3}\s*$/, '')
    .trim();
}

function pickBestStockCandidate(candidates, order, productPrefix) {
  let best = null;
  let bestPrice = null;
  let bestScore = -1;

  const orderProduct = String(order.productName || '').trim();

  for (const candidate of candidates) {
    if (!labelContainsIpPrefix(candidate.name, productPrefix)) continue;
    const price = getCurrentListPriceFromStock(candidate, order.memory);
    if (price == null || price <= 0) continue;

    const exactName = String(candidate.name || '').trim() === orderProduct;
    const exactPrefix = extractIpPrefixFromLabel(candidate.name) === productPrefix;
    const score = (exactName ? 2_000_000 : 0) + (exactPrefix ? 1_000_000 : 0) + price;

    if (score > bestScore) {
      best = candidate;
      bestPrice = price;
      bestScore = score;
    }
  }

  return best ? { stock: best, listPrice: bestPrice } : null;
}

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

  // Proxy orders put the IP range in the title ("… - 163.227"). That prefix also
  // matches a Windows VPS product, which is a different plan. Stay on the proxy
  // catalogue, and move a wrongly parked order back onto it.
  if (isNetbayProxyOrder(order, linked)) {
    if (linked && isNetbayProxyStock(linked)) {
      return {
        stock: linked,
        listPrice: getCurrentListPriceFromStock(linked, order.memory),
        correctedFrom: null,
      };
    }
    const baseName = proxyCatalogueName(order.productName);
    if (baseName && baseName !== String(order.productName || '').trim()) {
      const proxyStock = await IPStock.findOne({ name: baseName }).lean();
      if (proxyStock && isNetbayProxyStock(proxyStock)) {
        return {
          stock: proxyStock,
          listPrice: getCurrentListPriceFromStock(proxyStock, order.memory),
          correctedFrom: linked?._id || order.ipStockId,
        };
      }
    }
    return {
      stock: linked,
      listPrice: getCurrentListPriceFromStock(linked, order.memory),
      correctedFrom: null,
    };
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
  const prefixRegex = new RegExp(escaped, 'i');

  const orderProduct = String(order.productName || '').trim();
  if (orderProduct) {
    const exactStock = await IPStock.findOne({ name: orderProduct }).lean();
    if (exactStock) {
      const exactPrice = getCurrentListPriceFromStock(exactStock, order.memory);
      if (exactPrice != null && exactPrice > 0) {
        return {
          stock: exactStock,
          listPrice: exactPrice,
          correctedFrom: linked._id,
        };
      }
    }
  }

  const companyCandidates = await IPStock.find({
    company: linked.company,
    name: { $regex: prefixRegex },
  }).lean();

  let picked = pickBestStockCandidate(companyCandidates, order, productPrefix);

  if (!picked) {
    const globalCandidates = await IPStock.find({ name: { $regex: prefixRegex } }).lean();
    picked = pickBestStockCandidate(globalCandidates, order, productPrefix);
  }

  if (picked) {
    return {
      stock: picked.stock,
      listPrice: picked.listPrice,
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
