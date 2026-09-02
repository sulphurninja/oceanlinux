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

/**
 * Validity for VPS sold via `/admin/companies` (IP stock linked to a Company).
 *
 * - February → actual days in that February (28, or 29 in a leap year)
 * - All other months → 30 days (even when the calendar month has 31 days)
 */
export function getCompanyValidityDays(fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();
  if (base.getMonth() === 1) {
    return new Date(base.getFullYear(), 2, 0).getDate();
  }
  return 30;
}

/** @param {Date} [fromDate] */
export function calculateCompanyExpiryDate(fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const expiry = new Date(base);
  expiry.setDate(expiry.getDate() + getCompanyValidityDays(base));
  return expiry;
}

/** @param {Date|string} currentExpiry */
export function calculateCompanyRenewalExpiryDate(currentExpiry) {
  const current = new Date(currentExpiry);
  const now = new Date();
  const base = current > now ? current : now;
  return calculateCompanyExpiryDate(base);
}

/**
 * Renewal expiry — company / Hostheaven stocks use fixed 30-day cycles (Feb = calendar days).
 * Other providers use calendar month length (Jan/Mar/May… = 31 days).
 *
 * @param {Date|string} currentExpiry
 * @param {{ useCompanyValidity?: boolean }} [options]
 */
export function resolveOrderRenewalExpiryDate(currentExpiry, { useCompanyValidity = false } = {}) {
  return useCompanyValidity
    ? calculateCompanyRenewalExpiryDate(currentExpiry)
    : calculateRenewalExpiryDate(currentExpiry);
}

/**
 * Hostheaven panel `expiresAt` strings without a timezone are IST, not UTC.
 * @param {unknown} raw
 * @returns {Date|null}
 */
export function parseHostheavenExpiryDate(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(`${s}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Renew button opens when this many days or fewer remain (inclusive). */
export const RENEWAL_DAYS_BEFORE_EXPIRY = 2;

/** Post-expiry renewal grace — 0 = renewal closes after expiry day (IST). */
export const RENEWAL_DAYS_AFTER_EXPIRY = 0;

export function getDaysUntilExpiry(expiryDate) {
  if (!expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/** Calendar days until expiry in IST (matches renewal UI / daily cron). */
export function getDaysUntilExpiryIST(expiryDate) {
  if (!expiryDate) return 0;
  const ist = { timeZone: 'Asia/Kolkata' };
  const todayKey = new Intl.DateTimeFormat('en-CA', ist).format(new Date());
  const expiryKey = new Intl.DateTimeFormat('en-CA', ist).format(new Date(expiryDate));
  const todayMs = new Date(`${todayKey}T00:00:00+05:30`).getTime();
  const expiryMs = new Date(`${expiryKey}T00:00:00+05:30`).getTime();
  return Math.round((expiryMs - todayMs) / (1000 * 60 * 60 * 24));
}

/** True when renewal is allowed: 2 days before expiry through expiry day (IST), inclusive. */
export function isWithinRenewalWindow(expiryDate) {
  const daysLeft = getDaysUntilExpiryIST(expiryDate);
  return daysLeft <= RENEWAL_DAYS_BEFORE_EXPIRY && daysLeft >= 0;
}

/**
 * True once this order's paid validity has ended — including the same calendar
 * day after the expiry timestamp. Stops panel Sync from copying a resold IP's
 * new expiry onto the old customer. Paid renewals that still have remaining
 * time keep the order syncable even if `status` was left as expired.
 */
export function isExpiredServiceForCustomer(order, nowMs = Date.now()) {
  if (!order) return false;

  const paid = latestPaidRenewalExpiry(order);
  const currentMs = expiryTimeMs(order.expiryDate);
  const paidMs = expiryTimeMs(paid);
  const effectiveMs =
    paidMs != null && (currentMs == null || paidMs > currentMs) ? paidMs : currentMs;
  const effective = effectiveMs != null ? new Date(effectiveMs) : order.expiryDate;

  if (effectiveMs != null && effectiveMs < nowMs) return true;
  if (effective && getDaysUntilExpiryIST(effective) < 0) return true;

  if (String(order.status || '').toLowerCase() === 'expired') {
    if (effectiveMs != null && effectiveMs >= nowMs) return false;
    if (effective && getDaysUntilExpiryIST(effective) >= 0) return false;
    return true;
  }

  return false;
}

function expiryTimeMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Latest `newExpiry` from successful renewal payments on the order. */
export function latestPaidRenewalExpiry(order) {
  const renewals = Array.isArray(order?.renewalPayments) ? order.renewalPayments : [];
  let maxMs = null;
  for (const rp of renewals) {
    const ms = expiryTimeMs(rp?.newExpiry);
    if (ms != null && (maxMs == null || ms > maxMs)) maxMs = ms;
  }
  return maxMs != null ? new Date(maxMs) : null;
}

/**
 * Expiry to apply during panel sync.
 * Uses panel when it is ahead; never downgrades below order expiry or paid renewals.
 * @returns {Date|null} expiry to write, or null when unchanged
 */
export function resolvePanelSyncExpiryDate(order, panelExpiry) {
  if (isExpiredServiceForCustomer(order)) return null;

  const panelMs = expiryTimeMs(panelExpiry);
  const currentMs = expiryTimeMs(order?.expiryDate);
  const paidMs = expiryTimeMs(latestPaidRenewalExpiry(order));
  const floorMs = Math.max(currentMs || 0, paidMs || 0) || null;

  if (panelMs == null) {
    if (floorMs != null && (currentMs == null || currentMs < floorMs)) {
      return new Date(floorMs);
    }
    return null;
  }

  if (floorMs != null && panelMs < floorMs) {
    if (currentMs == null || currentMs < floorMs) return new Date(floorMs);
    return null;
  }

  if (currentMs == null || panelMs !== currentMs) return panelExpiry;
  return null;
}
