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

function toPlainMemoryOptions(memoryOptions) {
  if (!memoryOptions) return {};
  if (memoryOptions instanceof Map) return Object.fromEntries(memoryOptions);
  if (typeof memoryOptions.toObject === 'function') {
    return memoryOptions.toObject({ minimize: true });
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

/**
 * Keep only RAM tiers SmartVPS allows (On4GB / On8GB / …).
 * Preserves admin-set prices for tiers that stay enabled.
 * Normalizes keys like "8GB Vps" → "8GB".
 */
function buildSmartVpsMemorySync(pkg, existingMemoryOptions = {}) {
  const existing = toPlainMemoryOptions(existingMemoryOptions);
  const allowedRams = getAllowedRamsForPackage(pkg);
  const memoryOptions = {};
  const byMemory = {};
  const pid = String(pkg?.id ?? '');
  const pool = String(pkg?.name ?? '');

  for (const tier of RAM_TIERS) {
    if (!allowedRams.includes(tier.gb)) continue;
    const key = memoryKeyForGb(tier.gb);
    const prev = findMemoryOptionForGb(existing, tier.gb);
    memoryOptions[key] = {
      price:
        prev?.price != null && Number(prev.price) > 0
          ? Number(prev.price)
          : (DEFAULT_PRICING_GB[tier.gb] ?? 999),
      hostycareProductId: prev?.hostycareProductId ?? null,
      hostycareProductName: prev?.hostycareProductName ?? null,
    };
    byMemory[key] = {
      pid,
      pool,
      defaultOS: DEFAULT_OS,
    };
  }

  return { memoryOptions, byMemory, allowedRams };
}

function buildSmartVpsBlockFromPackage(pkg, existingSmartvps = {}, existingMemoryOptions = {}) {
  const { memoryOptions, byMemory, allowedRams } = buildSmartVpsMemorySync(pkg, existingMemoryOptions);
  const qty = Number(pkg?.ipv4 || 0);

  return {
    memoryOptions,
    smartvpsBlock: {
      ...existingSmartvps,
      provider: 'smartvps',
      packagePid: String(pkg.id),
      packageName: String(pkg.name),
      availableQty: qty,
      allowedRams,
      byMemory,
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
  normalizeMemoryTierKey,
  isSmartVpsMemoryListed,
  validateSmartVpsPackageRam,
  parseSmartVpsBuyResponse,
};
