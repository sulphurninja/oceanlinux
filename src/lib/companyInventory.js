const IPStock = require('@/models/ipStockModel');
const { detachSupersededIpOrders } = require('@/lib/orderIpOwnership');
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
  if (!stock?.company) return false;
  if (typeof stock.inventoryItemCount === 'number') return stock.inventoryItemCount > 0;
  return Array.isArray(stock.inventoryItems) && stock.inventoryItems.length > 0;
}

function stockHasLivePanelPlan(stock) {
  const {
    stockHasKurohostPlans,
    stockHasNetbayPlans,
    stockHasResellerPanelPlans,
  } = require('@/lib/ipStockAvailability');
  return (
    stockHasKurohostPlans(stock) ||
    stockHasNetbayPlans(stock) ||
    stockHasResellerPanelPlans(stock)
  );
}

/**
 * Saved VPS rows drive store availability only when fulfillment is inventory-first.
 * KuroHost/Netbay/Reseller plans may keep legacy sold rows — zone/live stock still applies.
 */
function inventoryDrivesStoreAvailability(stock) {
  if (!usesPreconfiguredInventory(stock)) return false;
  if (readCompanyConfig(stock).fulfillmentMode === 'inventory') return true;
  if (stockHasLivePanelPlan(stock)) return false;
  return true;
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
  if (mode === 'units') return 'units';
  if (stock?.availabilityManual === true) return 'units';
  if (usesPreconfiguredInventory(stock) && !stockHasLivePanelPlan(stock)) return 'inventory';
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
  const {
    usesHostdzireLiveStock,
    stockHasHostdzirePlans,
  } = require('@/lib/ipStockAvailability');
  if (usesHostdzireLiveStock(stock, company) && stockHasHostdzirePlans(stock)) {
    const cfg = toPlainConfigurations(stock.defaultConfigurations)?.hostdzire || {};
    const variants = cfg.variantStock && typeof cfg.variantStock === 'object' ? cfg.variantStock : {};
    if (Object.keys(variants).length) {
      return Object.values(variants).some((v) => v && typeof v === 'object' && v.available === true);
    }
    if (cfg.liveQty != null) return Number(cfg.liveQty) > 0;
    return !!stock?.available;
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
  if (usesCompanyUnitFulfillment(stock)) {
    return Math.max(0, Number(stock.stockCount) || 0) >= quantity;
  }
  if (hasUnallocatedCompanyInventory(stock)) {
    return countUnallocatedInventory(stock) >= quantity;
  }
  const {
    usesResellerLiveStock,
    usesNetbayLiveStock,
    usesKurohostLiveStock,
    usesHostdzireLiveStock,
    stockHasResellerPanelPlans,
    stockHasNetbayPlans,
    stockHasKurohostPlans,
    stockHasHostdzirePlans,
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
  if (usesHostdzireLiveStock(stock, company) && stockHasHostdzirePlans(stock)) {
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
  if (typeof stock?.inventoryAvailable === 'number' && !Array.isArray(stock?.inventoryItems)) {
    return stock.inventoryAvailable;
  }
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

  if (usesCompanyUnitFulfillment(stock)) {
    const manualUnits = Math.max(0, Number(stock.stockCount) || 0);
    let company = null;
    if (stock.company) {
      const Company = require('@/models/companyModel').default;
      company = await Company.findById(stock.company).select('resellerApi netbayApi kurohostApi').lean();
    }
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
    stock.available =
      manualUnits > 0 ||
      (hybridLive ? readLivePanelVariantAvailable(stock, company) : false);
    await stock.save();
    return stock;
  }

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

async function loadOrdersForInventoryItems(stock) {
  const ids = [];
  for (const item of stock.inventoryItems || []) {
    if (item.orderId) ids.push(item.orderId);
  }
  if (!ids.length) return new Map();
  const rows = await Order.find({ _id: { $in: ids } })
    .select('_id status inventoryItemId ipAddress')
    .lean();
  return new Map(rows.map((o) => [String(o._id), o]));
}

function scoreInventoryRow(item, order, { preferOrderId } = {}) {
  if (!order) {
    const allocMs = item.allocatedAt ? new Date(item.allocatedAt).getTime() : 0;
    return -1000 + (Number.isFinite(allocMs) ? allocMs / 1e15 : 0);
  }
  let score = 0;
  const orderIdStr = String(order._id);
  if (preferOrderId && orderIdStr === String(preferOrderId)) score += 1000;
  if (order.inventoryItemId && String(order.inventoryItemId) === String(item._id)) score += 500;
  if (order.status === 'active') score += 100;
  if (item.allocated) score += 10;
  const allocMs = item.allocatedAt ? new Date(item.allocatedAt).getTime() : 0;
  if (Number.isFinite(allocMs)) score += allocMs / 1e15;
  return score;
}

/**
 * Drop orphan rows (deleted orders) and duplicate IPs — keeps the row tied to the live order.
 */
async function pruneCompanyInventoryItems(stock, { preferOrderId, save = true } = {}) {
  if (!stock || !Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) {
    return { removed: 0, released: 0, saved: false };
  }

  const ordersById = await loadOrdersForInventoryItems(stock);
  const byIp = new Map();
  stock.inventoryItems.forEach((item, idx) => {
    const ip = cleanInventoryIp(item.ipAddress);
    if (!ip) return;
    const bucket = byIp.get(ip) || [];
    bucket.push({ idx, item });
    byIp.set(ip, bucket);
  });

  const removeIdx = new Set();
  let released = 0;

  for (const group of byIp.values()) {
    if (group.length === 1) {
      const { item } = group[0];
      if (!item.orderId) continue;
      if (!ordersById.has(String(item.orderId))) {
        item.allocated = false;
        item.orderId = null;
        item.allocatedAt = null;
        released += 1;
      }
      continue;
    }

    const scored = group.map(({ idx, item }) => {
      const order = item.orderId ? ordersById.get(String(item.orderId)) : null;
      return {
        idx,
        item,
        order,
        score: scoreInventoryRow(item, order, { preferOrderId }),
      };
    });
    scored.sort((a, b) => b.score - a.score);

    const keep = scored[0];
    if (keep.item.orderId && !keep.order) {
      keep.item.allocated = false;
      keep.item.orderId = null;
      keep.item.allocatedAt = null;
      released += 1;
    }

    for (const row of scored.slice(1)) {
      removeIdx.add(row.idx);
    }
  }

  if (removeIdx.size === 0 && released === 0) {
    return { removed: 0, released: 0, saved: false };
  }

  if (removeIdx.size > 0) {
    stock.inventoryItems = stock.inventoryItems.filter((_, idx) => !removeIdx.has(idx));
  }
  stock.markModified('inventoryItems');
  if (save) {
    await stock.save();
  }
  return { removed: removeIdx.size, released, saved: save };
}

/**
 * Keep pre-configured inventory in sync when company edits order credentials/IP.
 * Finds the linked row via inventoryItemId, orderId, or the order's previous IP.
 */
async function appendOrMergeInventoryItems(stock, newItems, { mergeDuplicateIp = false } = {}) {
  if (!stock || !Array.isArray(newItems) || newItems.length === 0) {
    return { added: 0, updated: 0, error: null };
  }

  await pruneCompanyInventoryItems(stock, { save: false });

  const toAppend = [];
  let updated = 0;

  for (const row of newItems) {
    const ip = cleanInventoryIp(row.ipAddress);
    if (!ip) continue;
    const idx = stock.inventoryItems.findIndex(
      (item) => cleanInventoryIp(item.ipAddress) === ip
    );
    if (idx >= 0) {
      if (!mergeDuplicateIp) {
        return { added: 0, updated: 0, error: `IP ${ip} is already in this stock inventory` };
      }
      const existing = stock.inventoryItems[idx];
      if (row.username) existing.username = row.username;
      if (row.password) existing.password = row.password;
      if (row.os) existing.os = row.os;
      if (row.expiryDate !== undefined) existing.expiryDate = row.expiryDate;
      if (row.addedAt) existing.addedAt = row.addedAt;
      updated += 1;
      continue;
    }
    toAppend.push(row);
  }

  if (toAppend.length) {
    stock.inventoryItems = [...(stock.inventoryItems || []), ...toAppend];
  }
  if (toAppend.length || updated) {
    stock.markModified('inventoryItems');
    await stock.save();
  }

  return { added: toAppend.length, updated, error: null };
}

async function syncCompanyInventoryAfterOrderUpdate(order, fields = {}, options = {}) {
  const inventoryFullAccess = options.inventoryFullAccess === true;
  if (!order?.ipStockId) {
    return { synced: false, reason: 'no_stock' };
  }

  const stock = await IPStock.findById(order.ipStockId);
  if (!stock || !Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) {
    return { synced: false, reason: 'no_inventory' };
  }

  await pruneCompanyInventoryItems(stock, { preferOrderId: order._id, save: true });

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

  let item = stock.inventoryItems[itemIndex];
  const nextIp =
    fields.ipAddress !== undefined ? cleanInventoryIp(fields.ipAddress) : cleanInventoryIp(item.ipAddress);

  if (fields.ipAddress !== undefined && nextIp) {
    const dupIdx = stock.inventoryItems.findIndex(
      (row, idx) => idx !== itemIndex && cleanInventoryIp(row.ipAddress) === nextIp
    );
    if (dupIdx >= 0) {
      const ordersById = await loadOrdersForInventoryItems(stock);
      const dupRow = stock.inventoryItems[dupIdx];
      const dupOrder = dupRow.orderId ? ordersById.get(String(dupRow.orderId)) : null;
      const thisOrderLive = ordersById.get(orderIdStr) || order;
      if (
        !inventoryFullAccess &&
        dupOrder &&
        dupOrder.status === 'active' &&
        thisOrderLive?.status === 'active'
      ) {
        throw new Error(`IP ${nextIp} is already in this stock inventory`);
      }
      await pruneCompanyInventoryItems(stock, { preferOrderId: order._id, save: true });
      itemIndex = stock.inventoryItems.findIndex(
        (row) => row._id && item._id && String(row._id) === String(item._id)
      );
      if (itemIndex < 0) {
        throw new Error(`IP ${nextIp} inventory row could not be resolved after cleanup`);
      }
      item = stock.inventoryItems[itemIndex];
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

const LIVE_ORDER_STATUSES = new Set(['active', 'confirmed', 'paid', 'completed']);

/** Mark saved rows Sold when a live order on this stock already uses that IP. */
async function reconcileCompanyInventoryAllocations(stock, orders = []) {
  if (!stock?.inventoryItems?.length) return { marked: 0 };

  await pruneCompanyInventoryItems(stock, { save: false });

  const byIp = new Map();
  for (const order of orders) {
    if (!LIVE_ORDER_STATUSES.has(String(order.status || '').toLowerCase())) continue;
    const ip = cleanInventoryIp(order.ipAddress);
    if (!ip) continue;
    const prev = byIp.get(ip);
    if (!prev || order.status === 'active') byIp.set(ip, order);
  }

  let marked = 0;
  for (const item of stock.inventoryItems) {
    const ip = cleanInventoryIp(item.ipAddress);
    const order = byIp.get(ip);
    if (!order) continue;
    const orderIdStr = String(order._id);
    if (item.allocated && String(item.orderId || '') === orderIdStr) continue;
    item.allocated = true;
    item.orderId = order._id;
    if (!item.allocatedAt) item.allocatedAt = new Date();
    marked += 1;
  }

  if (marked > 0) {
    stock.markModified('inventoryItems');
    await stock.save();
    await syncStockCountFromInventory(stock._id);
  }

  return { marked };
}

async function reconcileCompanyInventoryAllocationsForStocks(stockDocs, orders = []) {
  if (!Array.isArray(stockDocs) || !stockDocs.length) return { marked: 0 };
  const ordersByStock = new Map();
  for (const order of orders) {
    const sid = String(order.ipStockId || '');
    if (!sid) continue;
    const bucket = ordersByStock.get(sid) || [];
    bucket.push(order);
    ordersByStock.set(sid, bucket);
  }

  let marked = 0;
  for (const stock of stockDocs) {
    const sid = String(stock._id);
    const res = await reconcileCompanyInventoryAllocations(stock, ordersByStock.get(sid) || []);
    marked += res.marked || 0;
  }
  return { marked };
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

    await pruneCompanyInventoryItems(stock, { save: true });

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
      const detach = await detachSupersededIpOrders({
        ipStockId: order.ipStockId,
        inventoryItemId: item._id,
        ipAddress: item.ipAddress,
        currentOrderId: order._id,
      });
      if (detach.detached > 0) {
        console.log(
          `[companyInventory] Detached ${detach.detached} superseded order(s) for IP ${item.ipAddress} → order ${order._id}`
        );
      }
    } catch (detachErr) {
      console.error(
        `[companyInventory] detachSupersededIpOrders failed for order ${order._id}:`,
        detachErr.message
      );
    }

    try {
      await syncStockCountFromInventory(order.ipStockId);
    } catch (syncErr) {
      // IP/credentials are already on the order — stock count sync must not fail delivery.
      console.error(
        `[companyInventory] syncStockCountFromInventory failed for order ${order._id}:`,
        syncErr.message
      );
    }

    try {
      const stockDoc = await IPStock.findById(order.ipStockId);
      if (stockDoc) {
        await pruneCompanyInventoryItems(stockDoc, { preferOrderId: order._id, save: true });
      }
    } catch (pruneErr) {
      console.error(
        `[companyInventory] pruneCompanyInventoryItems failed for order ${order._id}:`,
        pruneErr.message
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
  inventoryDrivesStoreAvailability,
  stockHasLivePanelPlan,
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
  reconcileCompanyInventoryAllocations,
  reconcileCompanyInventoryAllocationsForStocks,
  pruneCompanyInventoryItems,
  appendOrMergeInventoryItems,
  cleanInventoryIp,
  looksLikeIpv4,
};
