/**
 * HostDzire live stock — qty from available_cloud_vps_data per inventory_key / RAM tier.
 */

const Company = require('@/models/companyModel').default;
const IPStock = require('@/models/ipStockModel');
const HostdzireApi = require('@/services/hostdzireApi');
const { getCompanyHostdzireApiConfig } = require('@/lib/companyHostdzireApi');
const {
  readHostdzireStockConfig,
  parseAvailableCloudVpsData,
  stockHasHostdzireConfig,
  normalizeMemoryKey,
} = require('@/lib/hostdzireStockConfig');
const { usesHostdzireLiveStock, storeAutoUnhideUpdate } = require('@/lib/ipStockAvailability');
const { toPlainConfigurations } = require('@/lib/advpsLiveStock');

const LOG = '[HOSTDZIRE-LIVE-STOCK]';
const STOCK_ROW_TTL_MS = 5 * 60 * 1000;

function isRecentStockSync(iso, ttlMs = STOCK_ROW_TTL_MS) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < ttlMs;
}

function isHostdzireIpStock(stock) {
  if (!stock?.company) return false;
  if (stockHasHostdzireConfig(stock)) return true;
  const tags = (stock?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('hostdzire') || String(stock?.provider || '').toLowerCase() === 'hostdzire';
}

async function getHostdzireApiForStock(stock) {
  if (!stock?.company) return null;
  const company = await Company.findById(stock.company).select('hostdzireApi name').lean();
  const cfg = getCompanyHostdzireApiConfig(company);
  if (!cfg) return null;
  return { api: new HostdzireApi(cfg), company, cfg };
}

function findInventoryQty(items, inventoryKey) {
  const row = (items || []).find((i) => i.inventoryKey === inventoryKey);
  return row ? Math.max(0, Number(row.qty) || 0) : 0;
}

function findInventoryRow(items, inventoryKey) {
  return (items || []).find((i) => i.inventoryKey === inventoryKey) || null;
}

/**
 * Sync one IPStock row from HostDzire inventory API.
 */
async function syncHostdzireIpStockRow(stock, { force = false, memoryOnly = null } = {}) {
  const plain = stock?.toObject?.() || stock;
  const stockCfg = readHostdzireStockConfig(plain);
  const hasMapping =
    stockCfg.inventoryKey ||
    Object.values(stockCfg.inventoryByMemory || {}).some((v) => v?.inventoryKey);
  if (!hasMapping) {
    return stock?.save ? stock : plain;
  }

  const company = plain.company
    ? await Company.findById(plain.company).select('hostdzireApi').lean()
    : null;
  if (!usesHostdzireLiveStock(plain, company)) {
    return stock?.save ? stock : plain;
  }

  if (!force && isRecentStockSync(stockCfg.lastStockSync)) {
    return stock?.save ? stock : plain;
  }

  const ctx = await getHostdzireApiForStock(plain);
  if (!ctx) {
    console.warn(`${LOG} No HostDzire API for stock ${plain._id}`);
    return stock?.save ? stock : plain;
  }

  let items = [];
  try {
    const res = await ctx.api.getAvailableCloudVpsData();
    items = parseAvailableCloudVpsData(res);
  } catch (err) {
    console.warn(`${LOG} Inventory fetch failed for ${plain._id}:`, err.message);
    return stock?.save ? stock : plain;
  }

  const now = new Date().toISOString();
  const variantStock = { ...(stockCfg.variantStock || {}) };
  const memoryKeys = Object.keys(stockCfg.inventoryByMemory || {});

  for (const memKey of memoryKeys) {
    if (memoryOnly && normalizeMemoryKey(memoryOnly) !== normalizeMemoryKey(memKey)) continue;
    const slot = stockCfg.inventoryByMemory[memKey];
    if (!slot?.inventoryKey) continue;
    const qty = findInventoryQty(items, slot.inventoryKey);
    const row = findInventoryRow(items, slot.inventoryKey);
    variantStock[memKey] = {
      available: qty > 0,
      qty,
      inventoryKey: slot.inventoryKey,
      ip: row?.ip || slot.ip || '',
      pid: row?.pid ?? slot.pid ?? null,
      checkedAt: now,
    };
  }

  let defaultQty = stockCfg.inventoryKey
    ? findInventoryQty(items, stockCfg.inventoryKey)
    : 0;
  if (!memoryKeys.length && stockCfg.inventoryKey) {
    defaultQty = findInventoryQty(items, stockCfg.inventoryKey);
  }

  const anyVariantInStock = Object.values(variantStock).some((v) => v?.available === true);
  const inStock = memoryKeys.length ? anyVariantInStock : defaultQty > 0;

  const doc = await IPStock.findById(plain._id);
  if (!doc) return plain;

  const prev = toPlainConfigurations(doc.defaultConfigurations)?.hostdzire || {};
  const nextHostdzire = {
    ...prev,
    inventoryKey: stockCfg.inventoryKey || prev.inventoryKey || '',
    ip: stockCfg.ip || prev.ip || '',
    pid: stockCfg.pid ?? prev.pid ?? null,
    inventoryByMemory: stockCfg.inventoryByMemory || prev.inventoryByMemory || {},
    variantStock,
    liveQty: memoryKeys.length ? (anyVariantInStock ? 1 : 0) : defaultQty,
    lastStockSync: now,
  };

  doc.defaultConfigurations = doc.defaultConfigurations || new Map();
  if (typeof doc.defaultConfigurations.set === 'function') {
    doc.defaultConfigurations.set('hostdzire', nextHostdzire);
  } else {
    doc.defaultConfigurations.hostdzire = nextHostdzire;
  }
  doc.available = inStock;
  Object.assign(doc, storeAutoUnhideUpdate(doc.toObject?.() || doc, inStock));
  doc.markModified('defaultConfigurations');
  await doc.save();

  console.log(
    `${LOG} ${plain.name || plain._id}: available=${inStock} variants=${JSON.stringify(
      Object.fromEntries(Object.entries(variantStock).map(([k, v]) => [k, v?.qty]))
    )}`
  );
  return doc;
}

function isHostdzireVariantInStock(stock, company, memory) {
  if (!isHostdzireIpStock(stock)) return true;
  if (!usesHostdzireLiveStock(stock, company)) {
    return !!stock?.available;
  }

  const cfg = readHostdzireStockConfig(stock);
  const memKey = String(memory || '').trim();

  if (memKey && cfg.inventoryByMemory && Object.keys(cfg.inventoryByMemory).length) {
    const normalized = normalizeMemoryKey(memKey);
    for (const [k, variant] of Object.entries(cfg.variantStock || {})) {
      if (normalizeMemoryKey(k) === normalized) {
        if (variant?.available === true) return true;
        if (variant?.qty != null) return Number(variant.qty) > 0;
      }
    }
    const slot = Object.entries(cfg.inventoryByMemory).find(
      ([k]) => normalizeMemoryKey(k) === normalized
    )?.[1];
    if (slot?.inventoryKey) {
      return !!stock?.available;
    }
    return false;
  }

  if (cfg.liveQty != null) return cfg.liveQty > 0;
  return !!stock?.available;
}

async function refreshHostdzireStockForCustomer({ force = false } = {}) {
  const stocks = await IPStock.find({
    company: { $exists: true, $ne: null },
    $or: [
      { 'defaultConfigurations.hostdzire.inventoryKey': { $exists: true, $ne: '' } },
      { 'defaultConfigurations.hostdzire.inventoryByMemory': { $exists: true } },
      { tags: 'hostdzire' },
      { provider: 'hostdzire' },
    ],
  }).lean();

  let inStock = 0;
  let synced = 0;
  for (const row of stocks) {
    const company = row.company
      ? await Company.findById(row.company).select('hostdzireApi').lean()
      : null;
    if (!usesHostdzireLiveStock(row, company)) continue;
    await syncHostdzireIpStockRow(row, { force });
    synced += 1;
    const fresh = await IPStock.findById(row._id).select('available').lean();
    if (fresh?.available) inStock += 1;
  }

  return { success: true, synced, inStock, total: stocks.length };
}

module.exports = {
  isHostdzireIpStock,
  syncHostdzireIpStockRow,
  isHostdzireVariantInStock,
  refreshHostdzireStockForCustomer,
};
