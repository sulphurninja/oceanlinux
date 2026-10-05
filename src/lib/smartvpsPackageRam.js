/** SmartVPS ipstock package RAM flags (On4GB, On8GB, On16GB, On32GB). */
const RAM_TIERS = [
  { gb: 4, flag: 'On4GB' },
  { gb: 8, flag: 'On8GB' },
  { gb: 16, flag: 'On16GB' },
  { gb: 32, flag: 'On32GB' },
];

const DEFAULT_PRICING_GB = { 4: 699, 8: 999, 16: 1499, 32: 1999 };
const DEFAULT_OS = 'ubuntu-22.04';

function memoryKeyForGb(gb) {
  return `${gb}GB`;
}

function readMapLike(value) {
  if (value == null || Array.isArray(value)) return null;
  if (typeof value.forEach !== 'function' || typeof value.get !== 'function') return null;
  const plain = {};
  value.forEach((entry, key) => {
    plain[key] = entry;
  });
  return plain;
}

function toPlainMemoryOptions(memoryOptions) {
  if (!memoryOptions) return {};
  const asMap = readMapLike(memoryOptions);
  if (asMap) return asMap;
  if (memoryOptions instanceof Map) return Object.fromEntries(memoryOptions);
  if (typeof memoryOptions.toObject === 'function') {
    try {
      return memoryOptions.toObject({ flattenMaps: true, minimize: false });
    } catch {
      return memoryOptions.toObject({ minimize: true });
    }
  }
  return { ...memoryOptions };
}

function getAllowedRamsForPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return [];
  return RAM_TIERS.filter(({ flag }) => pkg[flag] === true).map(({ gb }) => gb);
}

function findMemoryOptionForGb(existing, gb) {
  const existingPlain = toPlainMemoryOptions(existing);
  const cleanKey = memoryKeyForGb(gb);
  if (existingPlain[cleanKey]) return existingPlain[cleanKey];

  for (const [key, value] of Object.entries(existingPlain)) {
    const match = String(key).match(/(\d+)\s*gb/i);
    if (match && Number(match[1]) === gb) return value;
  }
  return null;
}

/** Collect highest admin-set price per GB tier from live + archived options. */
function collectAdminPricesByGb(...sources) {
  const byGb = new Map();
  for (const source of sources) {
    const plain = toPlainMemoryOptions(source);
    for (const [key, value] of Object.entries(plain)) {
      const match = String(key).match(/(\d+)\s*gb/i);
      if (!match) continue;
      const gb = Number(match[1]);
      const price = Number(value?.price);
      if (!Number.isFinite(gb) || !(price > 0)) continue;
      byGb.set(gb, Math.max(byGb.get(gb) || 0, price));
    }
  }
  return byGb;
}

/** Persistent admin rates (survive RAM hide/show + SmartVPS sync). Values: number or { price }. */
function pricesByGbFromLocked(adminLockedMemoryPrices) {
  const byGb = new Map();
  const plain = toPlainObject(adminLockedMemoryPrices);
  for (const [key, val] of Object.entries(plain)) {
    const match = String(key).match(/(\d+)\s*gb/i);
    if (!match) continue;
    const gb = Number(match[1]);
    const price = typeof val === 'number' ? val : Number(val?.price);
    if (!Number.isFinite(gb) || !(price > 0)) continue;
    byGb.set(gb, Math.max(byGb.get(gb) || 0, price));
  }
  return byGb;
}

function mergeAdminLockedMemoryPrices(existingLocked, memoryOptions, archivedMemoryOptions = {}) {
  const out = {};
  for (const [gb, price] of pricesByGbFromLocked(existingLocked)) {
    out[memoryKeyForGb(gb)] = price;
  }
  for (const [gb, price] of collectAdminPricesByGb(archivedMemoryOptions)) {
    const key = memoryKeyForGb(gb);
    if (!(Number(out[key]) > 0)) out[key] = price;
  }
  // The rate written in admin replaces an older lock, including a lower rate.
  for (const [gb, price] of collectAdminPricesByGb(memoryOptions)) {
    out[memoryKeyForGb(gb)] = price;
  }
  return out;
}

/**
 * Sync must not change a rate already saved in admin.
 * A live price stays exactly as written. Archive and lock only fill a tier that is not live.
 */
function preserveAdminMemoryPrices(
  existingMemoryOptions,
  syncedMemoryOptions,
  archivedMemoryOptions = {},
  adminLockedMemoryPrices = {}
) {
  const existing = toPlainMemoryOptions(existingMemoryOptions);
  const archived = toPlainObject(archivedMemoryOptions);
  const lockedByGb = pricesByGbFromLocked(adminLockedMemoryPrices);
  const out = { ...toPlainMemoryOptions(syncedMemoryOptions) };

  for (const [key, option] of Object.entries(out)) {
    const match = String(key).match(/(\d+)\s*gb/i);
    if (!match) continue;
    const gb = Number(match[1]);
    const kept = keptAdminPrice(gb, existing, archived, lockedByGb, option);
    if (kept == null || Number(option?.price) === kept) continue;
    out[key] = {
      ...option,
      price: kept,
      hostycareProductId: option?.hostycareProductId ?? null,
      hostycareProductName: option?.hostycareProductName ?? null,
    };
  }
  return out;
}

function toPlainObject(value) {
  if (!value || typeof value !== 'object') return {};
  const asMap = readMapLike(value);
  if (asMap) return asMap;
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === 'function') {
    try {
      return value.toObject({ flattenMaps: true, minimize: false });
    } catch {
      return value.toObject({ minimize: true });
    }
  }
  return { ...value };
}

/** Admin-written price wins. Sync may fill a brand-new tier only. */
function keptAdminPrice(gb, existing, archived, lockedByGb, prev) {
  const live = collectAdminPricesByGb(existing).get(gb);
  if (live > 0) return live;
  const archivedPrice = collectAdminPricesByGb(archived).get(gb);
  if (archivedPrice > 0) return archivedPrice;
  const locked = lockedByGb.get(gb);
  if (locked > 0) return locked;
  const prevPrice = Number(prev?.price);
  if (prevPrice > 0) return prevPrice;
  return null;
}

/**
 * Keep only RAM tiers SmartVPS allows (On4GB / On8GB / …).
 * Preserves admin-set prices for tiers that stay enabled.
 * Disabled tiers are archived so they auto-restore when SmartVPS re-enables them.
 */
function buildSmartVpsMemorySync(
  pkg,
  existingMemoryOptions = {},
  archivedMemoryOptions = {},
  adminLockedMemoryPrices = {}
) {
  const existing = toPlainMemoryOptions(existingMemoryOptions);
  const archived = toPlainObject(archivedMemoryOptions);
  const lockedByGb = pricesByGbFromLocked(adminLockedMemoryPrices);
  const allowedRams = getAllowedRamsForPackage(pkg);
  const memoryOptions = {};
  const byMemory = {};
  const nextArchived = { ...archived };
  const pid = String(pkg?.id ?? '');
  const pool = String(pkg?.name ?? '');

  for (const tier of RAM_TIERS) {
    const key = memoryKeyForGb(tier.gb);
    if (!allowedRams.includes(tier.gb)) {
      const live = findMemoryOptionForGb(existing, tier.gb);
      if (live) {
        nextArchived[key] = live;
      } else if (!nextArchived[key]) {
        // No live tier — do not seed default prices into archive (prevents wrong renewals on re-enable).
      }
      continue;
    }

    const prev =
      findMemoryOptionForGb(existing, tier.gb) || findMemoryOptionForGb(nextArchived, tier.gb);
    const savedPrice = keptAdminPrice(tier.gb, existing, archived, lockedByGb, prev);
    const resolvedPrice = savedPrice != null ? savedPrice : (DEFAULT_PRICING_GB[tier.gb] ?? 999);
    memoryOptions[key] = {
      price: resolvedPrice,
      hostycareProductId: prev?.hostycareProductId ?? null,
      hostycareProductName: prev?.hostycareProductName ?? null,
    };
    byMemory[key] = {
      pid,
      pool,
      defaultOS: DEFAULT_OS,
    };
    delete nextArchived[key];
  }

  return { memoryOptions, byMemory, allowedRams, archivedMemoryOptions: nextArchived };
}

function buildSmartVpsBlockFromPackage(pkg, existingSmartvps = {}, existingMemoryOptions = {}) {
  const archivedMemoryOptions = existingSmartvps?.archivedMemoryOptions || {};
  const adminLockedMemoryPrices = mergeAdminLockedMemoryPrices(
    existingSmartvps?.adminLockedMemoryPrices,
    existingMemoryOptions,
    archivedMemoryOptions
  );
  const { memoryOptions, byMemory, allowedRams, archivedMemoryOptions: nextArchived } =
    buildSmartVpsMemorySync(pkg, existingMemoryOptions, archivedMemoryOptions, adminLockedMemoryPrices);
  const finalizedMemoryOptions = finalizeSmartVpsMemorySync(
    existingMemoryOptions,
    memoryOptions,
    nextArchived,
    adminLockedMemoryPrices
  );
  const nextLocked = mergeAdminLockedMemoryPrices(
    adminLockedMemoryPrices,
    finalizedMemoryOptions,
    nextArchived
  );
  const qty = Number(pkg?.ipv4 || 0);

  return {
    memoryOptions: finalizedMemoryOptions,
    smartvpsBlock: {
      ...existingSmartvps,
      provider: 'smartvps',
      packagePid: String(pkg.id),
      packageName: String(pkg.name),
      availableQty: qty,
      allowedRams,
      byMemory,
      archivedMemoryOptions: nextArchived,
      adminLockedMemoryPrices: nextLocked,
      preserveAdminPricing: true,
    },
  };
}

function finalizeSmartVpsMemorySync(
  existingMemoryOptions,
  syncedMemoryOptions,
  archivedMemoryOptions = {},
  adminLockedMemoryPrices = {}
) {
  return preserveAdminMemoryPrices(
    existingMemoryOptions,
    syncedMemoryOptions,
    archivedMemoryOptions,
    adminLockedMemoryPrices
  );
}

function isSmartVpsConfiguredDefaults(defaultConfigurations) {
  const sv = defaultConfigurations?.smartvps;
  if (!sv || typeof sv !== 'object') return false;
  return Boolean(sv.packagePid || sv.packageName || sv.provider === 'smartvps');
}

/** Call after admin merge/save so locked prices persist across RAM archive + panel sync. */
function applySmartVpsAdminLockedPricesOnSave(mergedDefaults, memoryOptions, existingMemoryOptions) {
  if (!isSmartVpsConfiguredDefaults(mergedDefaults)) return mergedDefaults;
  const sv = mergedDefaults.smartvps || {};
  const mem = memoryOptions !== undefined ? memoryOptions : existingMemoryOptions;
  const arch = sv.archivedMemoryOptions || {};
  return {
    ...mergedDefaults,
    smartvps: {
      ...sv,
      adminLockedMemoryPrices: mergeAdminLockedMemoryPrices(
        sv.adminLockedMemoryPrices,
        mem,
        arch
      ),
    },
  };
}

function normalizeMemoryTierKey(memory) {
  const raw = String(memory || '').trim();
  if (!raw) return '';
  const gb = raw.match(/(\d+)\s*gb/i);
  if (gb) return `${gb[1]}GB`;
  const num = raw.match(/^(\d+)$/);
  return num ? `${num[1]}GB` : raw;
}

function isSmartVpsMemoryListed(stock, memory) {
  if (!memory) return true;
  const key = normalizeMemoryTierKey(memory);
  const opts = toPlainMemoryOptions(stock?.memoryOptions);
  return Boolean(key && opts[key] && Number(opts[key].price) > 0);
}

function validateSmartVpsPackageRam(pkg, ramGb) {
  const ram = Number.parseInt(String(ramGb || ''), 10);
  if (!Number.isFinite(ram) || ram <= 0) {
    return { ok: false, allowedRams: getAllowedRamsForPackage(pkg), error: 'Invalid RAM value' };
  }

  const tier = RAM_TIERS.find((t) => t.gb === ram);
  if (!tier) {
    const allowedRams = getAllowedRamsForPackage(pkg);
    return {
      ok: false,
      allowedRams,
      error: `RAM ${ram}GB is not a supported SmartVPS tier for package "${pkg?.name || '?'}". Allowed: ${allowedRams.join(', ') || 'none'}GB`,
    };
  }

  if (pkg[tier.flag] !== true) {
    const allowedRams = getAllowedRamsForPackage(pkg);
    return {
      ok: false,
      allowedRams,
      error:
        `Package "${pkg?.name || '?'}" does not support ${ram}GB RAM (On${ram}GB=false). ` +
        `Available sizes: ${allowedRams.join(', ') || 'none'}GB only.`,
    };
  }

  return { ok: true, allowedRams: getAllowedRamsForPackage(pkg), error: null };
}

/** Parse buyvps body: IP, plain success/processing, or "error|message". */
function parseSmartVpsBuyResponse(raw) {
  const text = typeof raw === 'string' ? raw.trim() : JSON.stringify(raw ?? '');
  let unwrapped = text;
  if (unwrapped.startsWith('"') && unwrapped.endsWith('"')) {
    try {
      unwrapped = JSON.parse(unwrapped);
    } catch {
      unwrapped = text.replace(/^"+|"+$/g, '');
    }
  }

  const body = String(unwrapped).trim();

  if (/^error\b/i.test(body) || body.toLowerCase().startsWith('error|')) {
    const message = body.includes('|') ? body.split('|').slice(1).join('|').trim() : body;
    return { ok: false, ip: null, status: 'error', message: message || body };
  }

  const ipMatch = body.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (ipMatch) {
    return { ok: true, ip: ipMatch[0], status: 'success', message: body };
  }

  if (/^(success|processing|pending)$/i.test(body)) {
    return { ok: true, ip: null, status: body.toLowerCase(), message: body };
  }

  try {
    const obj = typeof raw === 'object' && raw !== null ? raw : JSON.parse(body);
    const ip =
      obj.ip ||
      obj.IP ||
      obj.ipv4 ||
      obj.assignedIp ||
      obj.assigned_ip ||
      (typeof obj.message === 'string' ? obj.message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] : null);
    if (ip) return { ok: true, ip, status: String(obj.status || 'success'), message: body };
    if (/error/i.test(String(obj.status || obj.message || ''))) {
      return { ok: false, ip: null, status: 'error', message: String(obj.message || obj.status || body) };
    }
  } catch {
    /* not JSON */
  }

  return { ok: false, ip: null, status: 'unknown', message: body || 'Empty buyVps response' };
}

module.exports = {
  RAM_TIERS,
  DEFAULT_PRICING_GB,
  memoryKeyForGb,
  toPlainMemoryOptions,
  getAllowedRamsForPackage,
  buildSmartVpsMemorySync,
  buildSmartVpsBlockFromPackage,
  preserveAdminMemoryPrices,
  finalizeSmartVpsMemorySync,
  collectAdminPricesByGb,
  mergeAdminLockedMemoryPrices,
  pricesByGbFromLocked,
  applySmartVpsAdminLockedPricesOnSave,
  isSmartVpsConfiguredDefaults,
  normalizeMemoryTierKey,
  isSmartVpsMemoryListed,
  validateSmartVpsPackageRam,
  parseSmartVpsBuyResponse,
};
