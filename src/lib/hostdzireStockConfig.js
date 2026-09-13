/**
 * Per-IPStock HostDzire inventory mapping.
 * Stored under defaultConfigurations.hostdzire on the IPStock document.
 *
 * Shape:
 *   {
 *     inventoryKey: 'ip_1_vps9',           // legacy default
 *     inventoryByMemory: {
 *       '4GB': { inventoryKey, ip, pid, vps },
 *       '8GB': { inventoryKey, ip, pid, vps },
 *     },
 *     variantStock: { '4GB': { available, qty, inventoryKey }, ... },
 *     defaultOs: { Linux: 'Ubuntu 22 64', Windows: 'Windows 2022 64' },
 *   }
 */

function normalizeMemoryKey(memory) {
  return String(memory || '').trim().replace(/\s+/g, '').toUpperCase();
}

function readHostdzireStockConfig(ipStock) {
  const cfg = ipStock?.defaultConfigurations?.get?.('hostdzire')
    || ipStock?.defaultConfigurations?.hostdzire
    || {};

  const defaultOs = cfg.defaultOs instanceof Map
    ? Object.fromEntries(cfg.defaultOs)
    : (cfg.defaultOs || {});

  const inventoryByMemory = cfg.inventoryByMemory instanceof Map
    ? Object.fromEntries(cfg.inventoryByMemory)
    : (cfg.inventoryByMemory || {});

  const variantStock = cfg.variantStock instanceof Map
    ? Object.fromEntries(cfg.variantStock)
    : (cfg.variantStock || {});

  return {
    inventoryKey: String(cfg.inventoryKey || '').trim(),
    ip: String(cfg.ip || '').trim(),
    pid: cfg.pid != null ? Number(cfg.pid) : null,
    vps: cfg.vps != null ? Number(cfg.vps) : null,
    inventoryByMemory,
    variantStock,
    defaultOs,
    liveQty: cfg.liveQty != null ? Number(cfg.liveQty) : null,
    lastStockSync: cfg.lastStockSync || null,
  };
}

function parseAvailableCloudVpsData(payload) {
  const data = payload?.data || payload?.result || payload;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];

  return Object.entries(data)
    .map(([inventoryKey, val]) => ({
      inventoryKey,
      ip: String(val?.ip || '').trim(),
      qty: Math.max(0, Number(val?.qty) || 0),
      pid: val?.pid != null ? Number(val.pid) : null,
      vps: val?.vps != null ? Number(val.vps) : null,
      available: Math.max(0, Number(val?.qty) || 0) > 0,
    }))
    .sort((a, b) => a.ip.localeCompare(b.ip) || a.inventoryKey.localeCompare(b.inventoryKey));
}

function stockHasHostdzireConfig(ipStock) {
  const cfg = readHostdzireStockConfig(ipStock);
  if (cfg.inventoryKey) return true;
  return Object.values(cfg.inventoryByMemory || {}).some((v) => v && v.inventoryKey);
}

function stockHasHostdzirePlans(stock) {
  if (!stock?.company) return false;
  return stockHasHostdzireConfig(stock);
}

/**
 * Resolve HostDzire inventory slot for a customer RAM tier (4GB, 8GB, …).
 */
function resolveHostdzireInventoryForMemory(stockCfg, memory) {
  const byMem = stockCfg?.inventoryByMemory || {};
  const target = normalizeMemoryKey(memory);

  if (target) {
    for (const [memKey, slot] of Object.entries(byMem)) {
      if (normalizeMemoryKey(memKey) === target && slot?.inventoryKey) {
        return {
          inventoryKey: String(slot.inventoryKey).trim(),
          ip: String(slot.ip || '').trim(),
          pid: slot.pid != null ? Number(slot.pid) : null,
          vps: slot.vps != null ? Number(slot.vps) : null,
          memory: memKey,
        };
      }
    }
  }

  if (stockCfg?.inventoryKey) {
    return {
      inventoryKey: stockCfg.inventoryKey,
      ip: stockCfg.ip || '',
      pid: stockCfg.pid ?? null,
      vps: stockCfg.vps ?? null,
      memory: memory || null,
    };
  }

  return null;
}

function listHostdzireInventoryKeys(stockCfg) {
  const keys = new Set();
  if (stockCfg?.inventoryKey) keys.add(stockCfg.inventoryKey);
  for (const slot of Object.values(stockCfg?.inventoryByMemory || {})) {
    if (slot?.inventoryKey) keys.add(String(slot.inventoryKey).trim());
  }
  return [...keys];
}

function resolveHostdzirePlaceOrderOs(stockCfg, { isWindows, orderOs } = {}) {
  const defaults = stockCfg?.defaultOs || {};
  if (isWindows) {
    return defaults.Windows || defaults.windows || orderOs || 'Windows 2022 64';
  }
  return defaults.Linux || defaults.linux || orderOs || 'Ubuntu 22 64';
}

module.exports = {
  normalizeMemoryKey,
  readHostdzireStockConfig,
  parseAvailableCloudVpsData,
  stockHasHostdzireConfig,
  stockHasHostdzirePlans,
  resolveHostdzireInventoryForMemory,
  listHostdzireInventoryKeys,
  resolveHostdzirePlaceOrderOs,
};
