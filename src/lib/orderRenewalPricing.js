/**
 * Renewal pricing for existing orders.
 *
 * - Base rate = current IP stock list price (falls back to locked purchase price
 *   when live stock price is unavailable).
 * - Promo from first purchase applies on every renewal (subtracted from base).
 */

function reconstructListPriceAtPurchase(order) {
  const paid = Number(order?.price) || 0;
  const promoDiscount = Number(order?.promoDiscount) || 0;
  if (paid > 0 && promoDiscount > 0) {
    return paid + promoDiscount;
  }
  return 0;
}

/** List price locked at first purchase (fallback when live stock price missing). */
export function getOrderLockedListPrice(order) {
  if (!order) return 0;

  const paid = Number(order.price) || 0;
  const fromOriginal = Number(order.originalPrice);
  const fromPaidPlusPromo = reconstructListPriceAtPurchase(order);

  if (fromPaidPlusPromo > 0 && paid < fromPaidPlusPromo) {
    if (Number.isFinite(fromOriginal) && fromOriginal > 0) {
      if (fromPaidPlusPromo > fromOriginal && paid < fromOriginal) {
        return fromPaidPlusPromo;
      }
      return fromOriginal;
    }
    return fromPaidPlusPromo;
  }

  if (Number.isFinite(fromOriginal) && fromOriginal > 0) {
    return fromOriginal;
  }

  return paid;
}

export function getCurrentListPriceFromStock(ipStock, memory) {
  if (!ipStock?.memoryOptions || !memory) return null;
  const opts = ipStock.memoryOptions;
  const entry = typeof opts.get === 'function' ? opts.get(memory) : opts[memory];
  const price = Number(entry?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * @param {object} order
 * @param {number|null} [currentListPrice] Live IP stock rate for this memory tier
 */
export function getOrderRenewalPrice(order, currentListPrice = null) {
  if (!order) return 0;

  const promoDiscount = Number(order.promoDiscount) || 0;
  const liveRate =
    currentListPrice != null && Number(currentListPrice) > 0
      ? Number(currentListPrice)
      : null;
  const baseRate = liveRate ?? getOrderLockedListPrice(order);

  if (promoDiscount > 0 && baseRate > 0) {
    return Math.max(1, baseRate - promoDiscount);
  }

  return baseRate;
}

export function getOrderRenewalPriceNote(order, currentListPrice = null) {
  if (!order) return null;

  const renewalPrice = getOrderRenewalPrice(order, currentListPrice);
  const promoDiscount = Number(order.promoDiscount) || 0;
  const promo = order.promoCode ? String(order.promoCode).trim() : '';
  const liveRate =
    currentListPrice != null && Number(currentListPrice) > 0
      ? Number(currentListPrice)
      : null;

  const parts = [];

  if (promo && promoDiscount > 0) {
    if (liveRate != null) {
      parts.push(
        `Your renewal rate is ₹${renewalPrice}/month — current rate ₹${liveRate} minus ₹${promoDiscount} off with ${promo}.`
      );
    } else {
      parts.push(
        `Your renewal rate is ₹${renewalPrice}/month — includes ₹${promoDiscount} off with ${promo} on every renewal.`
      );
    }
  } else if (renewalPrice > 0) {
    parts.push(
      liveRate != null
        ? `Your renewal rate is ₹${renewalPrice}/month (current rate).`
        : `Your renewal rate is ₹${renewalPrice}/month.`
    );
  }

  return parts.length > 0 ? parts.join(' ') : null;
}
