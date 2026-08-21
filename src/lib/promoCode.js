/**
 * Shared promo-code resolution for validate-promo, payment/create, cart, etc.
 */

function normalizePromoCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isPromoActive(promo) {
  return promo && promo.isActive !== false;
}

function findPromo(promoCodes, promoCode) {
  const needle = normalizePromoCode(promoCode);
  if (!needle) return null;
  const list = Array.isArray(promoCodes) ? promoCodes : [];
  return (
    list.find(
      (p) =>
        isPromoActive(p) &&
        normalizePromoCode(p?.code) === needle
    ) || null
  );
}

function computeDiscount(originalPrice, promo) {
  const base = Number(originalPrice) || 0;
  if (!promo || base <= 0) return 0;
  if (promo.discountType === 'percentage') {
    return Math.round((base * Number(promo.discount || 0)) / 100);
  }
  return Math.max(0, Number(promo.discount) || 0);
}

/**
 * @returns {{ valid: boolean, promo?: object, discount: number, finalPrice: number, message?: string }}
 */
function resolvePromoForPrice({ promoCodes, promoCode, originalPrice }) {
  const base = Number(originalPrice) || 0;
  const normalized = normalizePromoCode(promoCode);

  if (!normalized) {
    return { valid: true, discount: 0, finalPrice: Math.max(0, base) };
  }

  const promo = findPromo(promoCodes, normalized);
  if (!promo) {
    return {
      valid: false,
      discount: 0,
      finalPrice: base,
      message: 'Invalid or inactive promo code',
    };
  }

  const discount = computeDiscount(base, promo);
  const finalPrice = Math.max(1, base - discount);

  const message =
    promo.discountType === 'fixed'
      ? `₹${promo.discount} discount applied!`
      : `${promo.discount}% discount applied!`;

  return {
    valid: true,
    promo,
    discount,
    finalPrice,
    message,
    code: normalizePromoCode(promo.code),
  };
}

function getMemoryOption(stock, memory) {
  if (!stock?.memoryOptions || memory == null) return null;
  const key = String(memory).trim();
  if (typeof stock.memoryOptions.get === 'function') {
    return stock.memoryOptions.get(key) || null;
  }
  return stock.memoryOptions[key] || null;
}

module.exports = {
  normalizePromoCode,
  isPromoActive,
  findPromo,
  computeDiscount,
  resolvePromoForPrice,
  getMemoryOption,
};
