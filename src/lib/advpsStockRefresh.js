import { runAdvpsCatalogSync } from '@/lib/advpsCatalogSync';
import { runAdvpsStockCheck } from '@/lib/advpsStockCheck';

/** Min gap between customer-triggered full ADVPS refreshes (per warm server instance). */
const CUSTOMER_REFRESH_INTERVAL_MS = 60_000;

function getRefreshCache() {
  if (!global.advpsCustomerRefresh) {
    global.advpsCustomerRefresh = { lastAt: 0, lastResult: null };
  }
  return global.advpsCustomerRefresh;
}

/**
 * Full ADVPS refresh for customer IP Stock page:
 * 1. Sync catalog + variant stock from ADVPS API
 * 2. Live stock-check pass on all ⚡ plans
 */
export async function refreshAdvpsStockForCustomer({ force = false } = {}) {
  const cache = getRefreshCache();
  const now = Date.now();

  if (!force && cache.lastAt && now - cache.lastAt < CUSTOMER_REFRESH_INTERVAL_MS) {
    return {
      success: true,
      skipped: true,
      throttled: true,
      refreshedAt: cache.lastAt,
      nextRefreshInMs: CUSTOMER_REFRESH_INTERVAL_MS - (now - cache.lastAt),
      sync: cache.lastResult?.sync || null,
      stockCheck: cache.lastResult?.stockCheck || null,
    };
  }

  const sync = await runAdvpsCatalogSync();
  const stockCheck = await runAdvpsStockCheck();

  const result = {
    success: true,
    skipped: false,
    throttled: false,
    refreshedAt: now,
    sync,
    stockCheck,
  };

  cache.lastAt = now;
  cache.lastResult = result;
  return result;
}
