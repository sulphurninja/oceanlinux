/**
 * Calculate the expiry date based on the number of days in the current month.
 *
 * - January (31 days)  → +31 days
 * - February (28 days) → +28 days  |  leap year (29 days) → +29 days
 * - March (31 days)    → +31 days
 * - April (30 days)    → +30 days
 * - …and so on
 *
 * @param {Date} [fromDate] - The starting date (defaults to now).
 * @returns {Date} The calculated expiry date.
 */
export function calculateExpiryDate(fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const expiry = new Date(base);
  expiry.setDate(expiry.getDate() + daysInMonth);
  return expiry;
}

/**
 * Calculate a renewal expiry date.
 * Uses the later of currentExpiry and now as the base,
 * then adds the number of days in that base month.
 *
 * @param {Date|string} currentExpiry - The current expiry date on the order.
 * @returns {Date} The new expiry date.
 */
export function calculateRenewalExpiryDate(currentExpiry) {
  const current = new Date(currentExpiry);
  const now = new Date();
  const base = current > now ? current : now;
  return calculateExpiryDate(base);
}

/** Renew button opens when this many days or fewer remain (inclusive). */
export const RENEWAL_DAYS_BEFORE_EXPIRY = 2;

/** Grace period after expiry during which renewal is still allowed. */
export const RENEWAL_DAYS_AFTER_EXPIRY = 7;

export function getDaysUntilExpiry(expiryDate) {
  if (!expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/** True when renewal is allowed (ADVPS + company manual use the same window). */
export function isWithinRenewalWindow(expiryDate) {
  const daysLeft = getDaysUntilExpiry(expiryDate);
  return daysLeft <= RENEWAL_DAYS_BEFORE_EXPIRY && daysLeft >= -RENEWAL_DAYS_AFTER_EXPIRY;
}
