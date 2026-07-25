/**
 * Renewal pricing for existing orders.
 *
 * - Base rate = current IP stock list price (live rate for this memory tier).
 * - Promo from first purchase applies on every renewal: renewal = currentRate − promoDiscount.
 * - Example: bought at 1299−100=1199; rate raised to 1499 → renewal = 1499−100 = 1399.
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

/** Normalize "8GB Vps", "8gb", "8 GB" → "8GB" for memoryOptions lookup. */
export function normalizeMemoryKey(memory) {
  const raw = String(memory || '').trim();
  const m = raw.match(/(\d+)\s*GB/i);
  if (m) return `${m[1]}GB`;
  return raw;
}

export function getCurrentListPriceFromStock(ipStock, memory) {
  if (!ipStock?.memoryOptions || !memory) return null;
  const opts = ipStock.memoryOptions;
  const normalized = normalizeMemoryKey(memory);
  const variations = [memory, normalized, String(memory).replace(/\s+/g, ''), String(memory).toLowerCase()];
  for (const key of variations) {
    const entry = typeof opts.get === 'function' ? opts.get(key) : opts[key];
    const price = Number(entry?.price);
    if (Number.isFinite(price) && price > 0) return price;
  }
  // Last resort: match any key with same GB number
  const gb = normalized.match(/^(\d+)GB$/i);
  if (gb) {
    const entries = typeof opts.entries === 'function' ? [...opts.entries()] : Object.entries(opts || {});
    for (const [k, v] of entries) {
      if (String(k).replace(/\s+/g, '').toLowerCase().startsWith(`${gb[1]}gb`)) {
        const price = Number(v?.price);
        if (Number.isFinite(price) && price > 0) return price;
      }
    }
  }
  return null;
}

/** e.g. "🖥️ 192.232.xx" → "192.232", "103.183.232" → "103.183.232" (prefer 3 octets) */
export function extractIpPrefixFromLabel(label) {
  const raw = String(label || '');
  const three = raw.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})(?:\.xx)?\b/i);
  if (three) return three[1];
  const two = raw.match(/\b(\d{1,3}\.\d{1,3})(?:\.xx)?\b/i);
  if (two) return two[1];
  return null;
}

export function labelContainsIpPrefix(label, prefix) {
  if (!prefix || !label) return false;
  const escaped = String(prefix).replace(/\./g, '\\.');
  return new RegExp(`\\b${escaped}(?:\\.|\\b|\\.xx)`, 'i').test(String(label));
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

/**
 * @param {any} order
 * @param {number | null} [currentListPrice]
 */
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
