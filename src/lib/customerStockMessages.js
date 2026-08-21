const GENERIC_PLAN_OUT_OF_STOCK =
  'This plan is currently out of stock. Please choose another plan or check back later.';

const GENERIC_SLOT_OUT_OF_STOCK =
  'This package is currently out of stock. Please choose another plan or check back later.';

/** Patterns that must never be shown to customers on purchase / stock checks. */
const TECHNICAL_STOCK_MESSAGE_RE =
  /ADVPS|api\.advps|\/api\/v1|failed:|IP address not allowed|fetch error|timeout|HTTP \d{3}|rate limit|ECONNREFUSED|network error|SmartVPS|stock verification failed|sk_test_|x-api-key/i;

/**
 * Map any stock-check message to a safe customer-facing string.
 * Logs/API failures always become a generic out-of-stock message.
 */
export function customerStockUnavailableMessage(raw, { kind = 'plan' } = {}) {
  const fallback = kind === 'slot' ? GENERIC_SLOT_OUT_OF_STOCK : GENERIC_PLAN_OUT_OF_STOCK;
  if (!raw || typeof raw !== 'string') return fallback;

  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (TECHNICAL_STOCK_MESSAGE_RE.test(trimmed)) return fallback;

  // Memory-specific messages we generate in syncIpStockBeforePurchase
  if (/^[^\n]{1,80} is currently out of stock\. Please refresh/i.test(trimmed)) {
    return trimmed;
  }

  if (/^(This product|This plan|No slot IPs).*(out of stock|unavailable)/i.test(trimmed)) {
    return trimmed;
  }

  return fallback;
}

export { GENERIC_PLAN_OUT_OF_STOCK, GENERIC_SLOT_OUT_OF_STOCK };
