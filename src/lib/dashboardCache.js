/**
 * Stale-while-revalidate store for dashboard GETs.
 *
 * Dashboard pages are client components that fetch on mount, so without this
 * every navigation re-shows a skeleton and re-waits on the network. Pages seed
 * their state from here inside an effect (never during render — that would
 * desync hydration) and refresh silently in the background.
 *
 * Memory survives client-side navigation; sessionStorage survives a reload of
 * the same tab. Nothing is persisted across tabs or sessions.
 */

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const SESSION_PREFIX = 'oceanlinux:dashcache:';

/** @type {Map<string, { data: unknown, ts: number }>} */
const memory = new Map();

function sessionKey(key) {
  return `${SESSION_PREFIX}${key}`;
}

function readSession(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(key, entry) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(sessionKey(key), JSON.stringify(entry));
  } catch {
    /* quota or private mode — memory cache still applies */
  }
}

/**
 * Returns cached data when it is younger than maxAgeMs, otherwise null.
 * Call this from an effect, not from render.
 */
export function readDashboardCache(key, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!key) return null;
  const entry = memory.get(key) || readSession(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  if (!memory.has(key)) memory.set(key, entry);
  return entry.data;
}

export function writeDashboardCache(key, data) {
  if (!key || data === undefined) return;
  const entry = { data, ts: Date.now() };
  memory.set(key, entry);
  writeSession(key, entry);
}

/** Age of the cached entry in ms, or Infinity when absent. */
export function dashboardCacheAge(key) {
  if (!key) return Infinity;
  const entry = memory.get(key) || readSession(key);
  return entry ? Date.now() - entry.ts : Infinity;
}

export function clearDashboardCache(key) {
  if (key) {
    memory.delete(key);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(sessionKey(key));
      } catch {
        /* ignore */
      }
    }
    return;
  }
  memory.clear();
  if (typeof window === 'undefined') return;
  try {
    for (const k of Object.keys(window.sessionStorage)) {
      if (k.startsWith(SESSION_PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export const DASHBOARD_CACHE_KEYS = {
  currentUser: 'users:me',
  ipStock: 'ipstock:store:v2',
  slotIps: 'slotips:customer',
  ordersMe: 'orders:me',
  wallet: 'wallet',
  dashboardStats: (timeframe) => `dashboard:stats:${timeframe}`,
  resellerInfo: 'reseller:info',
  stockSyncedAt: 'ipstock:lastSync:v2',
};
