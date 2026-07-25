const IPStock = require('@/models/ipStockModel');
// orderModel uses `export default`, so the interop namespace must be unwrapped.
const Order = require('@/models/orderModel').default;

const VALID_OS = ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'];

function normalizeOs(raw) {
  const s = String(raw || '').trim();
  if (VALID_OS.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.includes('centos')) return 'CentOS 7';
  if (lower.includes('ubuntu')) return 'Ubuntu 22';
  if (lower.includes('windows')) return 'Windows 2022 64';
  return 'Windows 2022 64';
}

function defaultUsernameForOs(os) {
  const normalized = normalizeOs(os);
  return normalized === 'Windows 2022 64' ? 'Administrator' : 'root';
}

function resolveUsernameForOs(username, os) {
  const normalized = normalizeOs(os);
  const trimmed = String(username || '').trim();
  const expected = defaultUsernameForOs(normalized);

  if (!trimmed) return expected;
  if (normalized === 'Windows 2022 64' && trimmed.toLowerCase() === 'root') return 'Administrator';
  if (normalized !== 'Windows 2022 64' && trimmed.toLowerCase() === 'administrator') return 'root';
  return trimmed;
}

function defaultOsForServerType(serverType) {
  return serverType === 'VPS' ? 'Windows 2022 64' : 'Ubuntu 22';
}

function allowedOsForServerType(serverType) {
  return serverType === 'VPS' ? ['Windows 2022 64'] : ['Ubuntu 22', 'CentOS 7'];
}

function normalizeOsForServerType(rawOs, serverType) {
  const normalized = normalizeOs(rawOs);
  const allowed = allowedOsForServerType(serverType);
  if (allowed.includes(normalized)) return normalized;
  return defaultOsForServerType(serverType);
}

/** Company stock uses embedded inventory rows (vs plain stockCount). */
function usesPreconfiguredInventory(stock) {
  return !!(stock?.company && Array.isArray(stock.inventoryItems) && stock.inventoryItems.length > 0);
}

function readCompanyConfig(stock) {
  let cfg = stock?.defaultConfigurations?.company;
  if (!cfg && typeof stock?.defaultConfigurations?.get === 'function') {
    cfg = stock.defaultConfigurations.get('company');
  }
  return cfg && typeof cfg === 'object' ? cfg : {};
}

function mergeCompanyConfig(stock, patch) {
  return { ...readCompanyConfig(stock), ...patch };
}

/** How paid orders are fulfilled: manual units vs pre-configured inventory rows. */
function getCompanyFulfillmentMode(stock) {
  const mode = readCompanyConfig(stock).fulfillmentMode;
  if (mode === 'inventory') return 'inventory';
  if (stock?.availabilityManual === true) return 'units';
  if (usesPreconfiguredInventory(stock)) return 'inventory';
  return 'auto';
}

function usesCompanyInventoryFulfillment(stock, company) {
  if (!stock?.company) return false;
  return shouldAssignCompanyInventoryForOrder(stock, company);
}

/** Saved VPS rows waiting — these sell before live panel API buy. */
function hasUnallocatedCompanyInventory(stock) {
  return countUnallocatedInventory(stock) > 0;
}

function readLivePanelVariantAvailable(stock, company) {
  const {
    usesResellerLiveStock,
    usesNetbayLiveStock,
    usesKurohostLiveStock,
    stockHasResellerPanelPlans,
    stockHasNetbayPlans,
    stockHasKurohostPlans,
  } = require('@/lib/ipStockAvailability');
  const { toPlainConfigurations } = require('@/lib/advpsLiveStock');

  if (usesResellerLiveStock(stock, company) && stockHasResellerPanelPlans(stock)) {
    const cfg = toPlainConfigurations(stock.defaultConfigurations)?.resellerApi || {};
    const variants = cfg.variantStock && typeof cfg.variantStock === 'object' ? cfg.variantStock : {};
    return Object.values(variants).some((v) => v && typeof v === 'object' && v.available === true);
  }
  if (usesNetbayLiveStock(stock, company) && stockHasNetbayPlans(stock)) {
    const cfg = toPlainConfigurations(stock.defaultConfigurations)?.netbay || {};
    const variants = cfg.variantStock && typeof cfg.variantStock === 'object' ? cfg.variantStock : {};
    return Object.values(variants).some((v) => v && typeof v === 'object' && v.available === true);
  }
  if (usesKurohostLiveStock(stock, company) && stockHasKurohostPlans(stock)) {
    const cfg = toPlainConfigurations(stock.defaultConfigurations)?.kurohost || {};
    const variants = cfg.variantStock && typeof cfg.variantStock === 'object' ? cfg.variantStock : {};
    return Object.values(variants).some((v) => v && typeof v === 'object' && v.available === true);
  }
  return !!stock?.available;
}

/** True when the next paid order should take a saved inventory row (not API buy yet). */
function shouldAssignCompanyInventoryForOrder(stock, company) {
  if (!stock?.company || !hasUnallocatedCompanyInventory(stock)) return false;
  if (getCompanyFulfillmentMode(stock) === 'inventory') return true;
  if (usesPreconfiguredInventory(stock)) return true;
  return false;
}

/** Store can sell if saved VPS rows exist OR live panel zone/wallet says in stock. */
function isCompanyStockPurchasable(stock, company, quantity = 1) {
  if (!stock?.company) return false;
  if (hasUnallocatedCompanyInventory(stock)) {
    return countUnallocatedInventory(stock) >= quantity;
  }
  const {
    usesResellerLiveStock,
    usesNetbayLiveStock,
    usesKurohostLiveStock,
    stockHasResellerPanelPlans,
    stockHasNetbayPlans,
    stockHasKurohostPlans,
  } = require('@/lib/ipStockAvailability');
  if (usesResellerLiveStock(stock, company) && stockHasResellerPanelPlans(stock)) {
    return readLivePanelVariantAvailable(stock, company);
  }
  if (usesNetbayLiveStock(stock, company) && stockHasNetbayPlans(stock)) {
    return readLivePanelVariantAvailable(stock, company);
  }
  if (usesKurohostLiveStock(stock, company) && stockHasKurohostPlans(stock)) {
    return readLivePanelVariantAvailable(stock, company);
  }
  return getIpStockRemainingFromInventoryOrUnits(stock) >= quantity;
}

function getIpStockRemainingFromInventoryOrUnits(stock) {
  if (hasUnallocatedCompanyInventory(stock)) return countUnallocatedInventory(stock);
  return Math.max(0, Number(stock?.stockCount) || 0);
}

/** True only when company owner explicitly saved manual units (not live panel sync). */
function usesCompanyUnitFulfillment(stock) {
  return !!(stock?.company && stock.availabilityManual === true);
}

async function setCompanyFulfillmentMode(stockId, mode) {
  if (mode !== 'units' && mode !== 'inventory') {
    throw new Error('fulfillmentMode must be units or inventory');
  }

  const stock = await IPStock.findById(stockId);
  if (!stock) return null;

  const companyCfg = { ...readCompanyConfig(stock), fulfillmentMode: mode };
  stock.defaultConfigurations.set('company', companyCfg);
  stock.markModified('defaultConfigurations');
  await stock.save();

  if (mode === 'inventory') {
    return syncStockCountFromInventory(stockId);
  }
  return stock;
}

function countUnallocatedInventory(stock) {
  if (!Array.isArray(stock?.inventoryItems)) return 0;
  return stock.inventoryItems.filter((i) => !i.allocated).length;
}

/** Parse bulk lines: ip,user,pass,os OR ip|user|pass|os (one per line) */
function parseInventoryBulkLines(text, serverType = 'Linux') {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const items = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.includes('|') ? '|' : ',';
    const parts = line.split(sep).map((p) => p.trim());
    if (parts.length < 3) {
      errors.push({ line: i + 1, content: line, reason: 'Need ip, username, password (optional OS)' });
      continue;
    }
    const [ipAddress, username, password, osPart] = parts;
    if (!ipAddress || !password) {
      errors.push({ line: i + 1, content: line, reason: 'Missing ip or password' });
      continue;
    }
    if (!looksLikeIpv4(ipAddress)) {
      errors.push({ line: i + 1, content: line, reason: 'First column must be a valid IP address' });
      continue;
    }
    if (looksLikeIpv4(password)) {
      errors.push({
        line: i + 1,
        content: line,
        reason: 'Password looks like an IP address — check bulk paste columns (ip,user,pass,os)',
      });
      continue;
    }
    const os = normalizeOsForServerType(osPart, serverType);
    items.push({
      ipAddress,
      username: resolveUsernameForOs(username, os),
      password,
      os,
      allocated: false,
      orderId: null,
      allocatedAt: null,
      addedAt: new Date(),
    });
  }

  return { items, errors };
}

async function syncStockCountFromInventory(stockId) {
  const stock = await IPStock.findById(stockId);
  if (!stock || !usesPreconfiguredInventory(stock)) return stock;

  let company = null;
  if (stock.company) {
    const Company = require('@/models/companyModel').default;
    company = await Company.findById(stock.company).select('resellerApi netbayApi kurohostApi').lean();
  }

  const remaining = countUnallocatedInventory(stock);
  stock.stockCount = remaining;

  const {
    usesResellerLiveStock,
    usesNetbayLiveStock,
    usesKurohostLiveStock,
    stockHasResellerPanelPlans,
    stockHasNetbayPlans,
    stockHasKurohostPlans,
  } = require('@/lib/ipStockAvailability');

  const hybridLive =
    (usesResellerLiveStock(stock, company) && stockHasResellerPanelPlans(stock)) ||
    (usesNetbayLiveStock(stock, company) && stockHasNetbayPlans(stock)) ||
    (usesKurohostLiveStock(stock, company) && stockHasKurohostPlans(stock));

  if (hybridLive) {
    stock.available = remaining > 0 || readLivePanelVariantAvailable(stock, company);
  } else if (usesCompanyInventoryFulfillment(stock, company)) {
    stock.available = remaining > 0;
  } else {
    stock.available = remaining > 0;
  }

  if (stock.available && stock.autoHiddenFromStore) {
    const { storeAutoUnhideUpdate } = require('@/lib/ipStockAvailability');
    Object.assign(stock, storeAutoUnhideUpdate(stock, true));
  }
  await stock.save();
  return stock;
}

function cleanInventoryIp(ipAddress) {
  return String(ipAddress || '').split(':')[0].trim();
}

/** IPv4 check — used to reject bulk paste mistakes (password column = another IP). */
function looksLikeIpv4(value) {
  const s = cleanInventoryIp(value);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  return s.split('.').every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/**
 * Keep pre-configured inventory in sync when company edits order credentials/IP.
 * Finds the linked row via inventoryItemId, orderId, or the order's previous IP.
 */
async function syncCompanyInventoryAfterOrderUpdate(order, fields = {}) {
  if (!order?.ipStockId) {
    return { synced: false, reason: 'no_stock' };
  }

  const stock = await IPStock.findById(order.ipStockId);
  if (!stock || !Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) {
    return { synced: false, reason: 'no_inventory' };
  }

  const orderIdStr = String(order._id);
  let itemIndex = -1;

  if (order.inventoryItemId) {
    itemIndex = stock.inventoryItems.findIndex(
      (row) => String(row._id) === String(order.inventoryItemId)
    );
  }

  if (itemIndex < 0) {
    itemIndex = stock.inventoryItems.findIndex(
      (row) => row.orderId && String(row.orderId) === orderIdStr
    );
  }

  if (itemIndex < 0 && order.ipAddress) {
    const previousIp = cleanInventoryIp(order.ipAddress);
    itemIndex = stock.inventoryItems.findIndex(
      (row) => cleanInventoryIp(row.ipAddress) === previousIp && (!!row.allocated || !!row.orderId)
    );
  }

  if (itemIndex < 0) {
    return { synced: false, reason: 'no_linked_item' };
  }

  const item = stock.inventoryItems[itemIndex];
  const nextIp =
    fields.ipAddress !== undefined ? cleanInventoryIp(fields.ipAddress) : cleanInventoryIp(item.ipAddress);

  if (fields.ipAddress !== undefined && nextIp) {
    const duplicate = stock.inventoryItems.some(
      (row, idx) => idx !== itemIndex && cleanInventoryIp(row.ipAddress) === nextIp
    );
    if (duplicate) {
      throw new Error(`IP ${nextIp} is already in this stock inventory`);
    }
    item.ipAddress = nextIp;
  }

  if (fields.username !== undefined) item.username = fields.username;
  if (fields.password !== undefined) item.password = fields.password;
  if (fields.os !== undefined) item.os = fields.os;

  item.allocated = true;
  item.orderId = order._id;
  if (!item.allocatedAt) item.allocatedAt = new Date();

  stock.markModified('inventoryItems');
  await stock.save();

  if (!order.inventoryItemId) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { inventoryItemId: String(item._id) } }
    );
  }

  return { synced: true, itemId: String(item._id), ipAddress: item.ipAddress };
}

/**
 * Heal inventory rows that still store an old IP while the linked order has a new IP.
 * Runs during sync-all so extend lists stop showing superseded panel IPs.
 */
async function reconcileCompanyInventoryOrderIps(stockDocs, orders = []) {
  if (!Array.isArray(stockDocs) || !Array.isArray(orders) || orders.length === 0) {
    return { updated: 0 };
  }

  const orderById = new Map(orders.map((order) => [String(order._id), order]));
  const orderByInventoryItemId = new Map(
    orders
      .filter((order) => order.inventoryItemId)
      .map((order) => [String(order.inventoryItemId), order])
  );

  let updated = 0;

  for (const stock of stockDocs) {
    if (!Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) continue;

    let dirty = false;
    for (const item of stock.inventoryItems) {
      const linkedOrder =
        (item.orderId ? orderById.get(String(item.orderId)) : null) ||
        orderByInventoryItemId.get(String(item._id)) ||
        null;
      if (!linkedOrder?.ipAddress) continue;

      const orderIp = cleanInventoryIp(linkedOrder.ipAddress);
      const itemIp = cleanInventoryIp(item.ipAddress);
      if (!orderIp || orderIp === itemIp) continue;

      item.ipAddress = orderIp;
      item.allocated = true;
      item.orderId = linkedOrder._id;
      if (!item.allocatedAt) item.allocatedAt = new Date();
      dirty = true;
      updated += 1;
    }

    if (dirty) {
      stock.markModified('inventoryItems');
      await stock.save();
    }
  }

  return { updated };
}

/**
 * Assign the next unallocated inventory row to a confirmed order.
 * Idempotent if order.inventoryItemId is already set.
 */
async function allocateCompanyInventoryForOrder(order) {
  if (!order?.ipStockId || order.inventoryItemId) {
    return { allocated: false, skipped: true };
  }

  try {
    const allocated = await IPStock.findOneAndUpdate(
      { _id: order.ipStockId, 'inventoryItems.allocated': false },
      {
        $set: {
          'inventoryItems.$.allocated': true,
          'inventoryItems.$.orderId': order._id,
          'inventoryItems.$.allocatedAt': new Date(),
        },
      },
      { new: true }
    );

    if (!allocated) {
      return { allocated: false, reason: 'no_inventory_available', fallbackToApi: true };
    }

    const item = allocated.inventoryItems.find(
      (row) => row.orderId && row.orderId.toString() === order._id.toString()
    );

    if (!item) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Company inventory allocation mismatch';
      await order.save();
      return { allocated: false, reason: 'allocation_mismatch' };
    }

    order.inventoryItemId = item._id.toString();
    order.ipAddress = item.ipAddress;
    order.username = item.username;
    order.password = item.password;
    order.os = item.os || order.os;
    // Customer expiry stays from payment (buy date + 30 days).
    // item.expiryDate is the original Hostheaven panel expiry for company tracking only.
    order.provisioningStatus = 'active';
    order.status = 'active';
    order.autoProvisioned = true;
    order.inventoryDecremented = true;
    await order.save();

    try {
      await syncStockCountFromInventory(order.ipStockId);
    } catch (syncErr) {
      // IP/credentials are already on the order — stock count sync must not fail delivery.
      console.error(
        `[companyInventory] syncStockCountFromInventory failed for order ${order._id}:`,
        syncErr.message
      );
    }

    return { allocated: true, ipAddress: item.ipAddress };
  } catch (err) {
    order.provisioningStatus = 'failed';
    order.provisioningError = `Inventory allocation failed: ${err.message}`;
    await order.save();
    return { allocated: false, reason: err.message };
  }
}

module.exports = {
  VALID_OS,
  normalizeOs,
  defaultUsernameForOs,
  resolveUsernameForOs,
  defaultOsForServerType,
  allowedOsForServerType,
  normalizeOsForServerType,
  usesPreconfiguredInventory,
  getCompanyFulfillmentMode,
  usesCompanyInventoryFulfillment,
  hasUnallocatedCompanyInventory,
  shouldAssignCompanyInventoryForOrder,
  isCompanyStockPurchasable,
  usesCompanyUnitFulfillment,
  setCompanyFulfillmentMode,
  mergeCompanyConfig,
  readCompanyConfig,
  countUnallocatedInventory,
  parseInventoryBulkLines,
  syncStockCountFromInventory,
  allocateCompanyInventoryForOrder,
  syncCompanyInventoryAfterOrderUpdate,
  reconcileCompanyInventoryOrderIps,
  cleanInventoryIp,
  looksLikeIpv4,
};
