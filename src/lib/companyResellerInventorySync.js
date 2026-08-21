const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const {
  normalizeOsForServerType,
  resolveUsernameForOs,
  defaultUsernameForOs,
} = require('@/lib/companyInventory');
const {
  buildInventoryOwnerMaps,
  groupOrdersByIp,
  shouldSyncPanelDataToOrder,
} = require('@/lib/orderIpOwnership');

const EXPIRY_FETCH_COOLDOWN_MS = 5 * 60 * 1000;

function expiryMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** True when Hostheaven panel expiry is later than the customer's OceanLinux expiry. */
function panelExpiryExtendsCustomer(orderExpiry, panelExpiry) {
  const panelMs = expiryMs(panelExpiry);
  if (panelMs == null) return false;
  const orderMs = expiryMs(orderExpiry);
  if (orderMs == null) return true;
  return panelMs > orderMs;
}

/** Customer-facing sync: use panel date when it extends validity or differs. */
function shouldApplyPanelExpiryToCustomer(orderExpiry, panelExpiry) {
  const panelMs = expiryMs(panelExpiry);
  if (panelMs == null) return false;
  const orderMs = expiryMs(orderExpiry);
  if (orderMs == null) return true;
  return panelMs !== orderMs;
}

function createResellerApiClient(company) {
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    throw new Error('Hostheaven sync is not enabled for this company');
  }
  return new ResellerApi({
    ...cfg,
    label: cfg.label || company?.name || 'reseller',
  });
}

function cleanIpAddress(ipAddress) {
  return String(ipAddress || '').split(':')[0].trim();
}

/**
 * Fetch panel expiry for one IP (overview `expiresAt` + details fallback).
 */
async function fetchResellerExpiryByIp(company, ipAddress) {
  const cleanIp = cleanIpAddress(ipAddress);
  if (!cleanIp) {
    throw new Error('IP address is required');
  }

  const api = createResellerApiClient(company);
  const found = await api.findVmByIp(cleanIp, { skipCache: true });
  if (!found) {
    throw new Error(`No VM found on Hostheaven for IP ${cleanIp}`);
  }

  let details = null;
  try {
    details = await api.getVmDetails(found.vmId);
  } catch {
    // Overview row often has expiresAt — details optional for expiry-only sync.
  }

  const expiryDate = ResellerApi.extractVmExpiryDate(found.raw, details);
  if (!expiryDate) {
    throw new Error(`Hostheaven did not return expiry for IP ${cleanIp}`);
  }

  return {
    ipAddress: found.ip,
    expiryDate,
    vmId: found.vmId,
  };
}

/**
 * Look up a Hostheaven / reseller-panel VM by IP and return login credentials
 * for company pre-configured inventory.
 */
async function fetchResellerCredentialsByIp(company, ipAddress, serverType = 'Linux') {
  const cleanIp = cleanIpAddress(ipAddress);
  if (!cleanIp) {
    throw new Error('IP address is required');
  }

  const api = createResellerApiClient(company);
  const found = await api.findVmByIp(cleanIp, { skipCache: true });
  if (!found) {
    throw new Error(`No VM found on Hostheaven for IP ${cleanIp}`);
  }

  const details = await api.getVmDetails(found.vmId);
  const password = ResellerApi.extractVmPassword(details);
  if (!password) {
    throw new Error('Hostheaven did not return a password for this VM');
  }

  const osRaw =
    ResellerApi.extractVmOs(details) ||
    found.raw?.os ||
    found.raw?.operatingSystem ||
    found.raw?.templateName ||
    '';

  const os = normalizeOsForServerType(osRaw, serverType);
  const username = resolveUsernameForOs(
    ResellerApi.extractVmUsername(details) || defaultUsernameForOs(os),
    os
  );

  return {
    ipAddress: found.ip,
    username,
    password,
    os,
    vmId: found.vmId,
    serverName: found.serverName || '',
    expiryDate: ResellerApi.extractVmExpiryDate(found.raw, details),
  };
}

/**
 * Refresh panel expiry on every inventory row (old + new) from Hostheaven by IP.
 * Fetches the full Hostheaven overview once, then matches inventory IPs locally.
 */
async function syncAllInventoryExpiriesFromReseller(company, stockDocs) {
  const updated = [];
  const failed = [];

  const api = createResellerApiClient(company);
  let ipIndex;
  try {
    ipIndex = await api.buildVmIpIndex();
  } catch (err) {
    throw new Error(`Hostheaven overview fetch failed: ${err.message || 'unknown error'}`);
  }

  for (const stock of stockDocs) {
    if (!Array.isArray(stock.inventoryItems) || stock.inventoryItems.length === 0) continue;

    let dirty = false;
    for (const item of stock.inventoryItems) {
      const cleanIp = cleanIpAddress(item.ipAddress);
      if (!cleanIp) continue;

      try {
        const found = ipIndex.get(cleanIp);
        if (!found) {
          if (item.expiryDate) {
            item.expiryDate = null;
            dirty = true;
          }
          failed.push({
            stockId: String(stock._id),
            itemId: String(item._id),
            ipAddress: item.ipAddress,
            error: `No VM found on Hostheaven for IP ${cleanIp}`,
          });
          continue;
        }

        let expiryDate = found.expiryDate;
        if (!expiryDate) {
          try {
            const details = await api.getVmDetails(found.vmId);
            expiryDate = ResellerApi.extractVmExpiryDate(found.raw, details);
            if (expiryDate) {
              found.expiryDate = expiryDate;
              ipIndex.set(cleanIp, { ...found, expiryDate });
            }
          } catch {
            // details optional when overview lacks expiry
          }
        }

        if (!expiryDate) {
          throw new Error(`Hostheaven did not return expiry for IP ${cleanIp}`);
        }

        item.expiryDate = expiryDate;
        dirty = true;
        updated.push({
          stockId: String(stock._id),
          itemId: String(item._id),
          ipAddress: item.ipAddress,
          expiryDate,
        });
      } catch (err) {
        failed.push({
          stockId: String(stock._id),
          itemId: String(item._id),
          ipAddress: item.ipAddress,
          error: err.message || 'Sync failed',
        });
      }
    }

    if (dirty) {
      await stock.save();
    }
  }

  const orderSync = await syncCompanyOrderExpiriesFromPanelIndex(ipIndex, stockDocs, api);

  return {
    updated,
    failed,
    ordersUpdated: orderSync.updated,
    ordersSkipped: orderSync.skipped,
    ordersFailed: orderSync.failed,
    panelExpiriesByIp: Object.fromEntries(
      [...ipIndex.entries()]
        .filter(([, entry]) => entry.expiryDate)
        .map(([ip, entry]) => [ip, entry.expiryDate])
    ),
  };
}

/**
 * Match sold OceanLinux orders to panel expiry by IP (same source as inventory sync).
 */
async function syncCompanyOrderExpiriesFromPanelIndex(ipIndex, stockDocs, api = null) {
  const Order = (await import('@/models/orderModel')).default;
  const stockIds = stockDocs.map((s) => s._id).filter(Boolean);
  if (!stockIds.length) {
    return { updated: [], skipped: [], failed: [] };
  }

  const orders = await Order.find({
    ipStockId: { $in: stockIds },
    status: { $nin: ['cancelled', 'failed', 'expired', 'superseded'] },
    ipAddress: { $exists: true, $ne: '' },
  }).select('_id ipAddress expiryDate inventoryItemId ipStockId resellerVmId createdAt renewalPayments status');

  const { ownerByIp, ownerByItemId } = buildInventoryOwnerMaps(stockDocs);
  const ordersByIp = groupOrdersByIp(orders);
  const syncCtx = { ownerByIp, ownerByItemId, ordersByIp };

  const updated = [];
  const skipped = [];
  const failed = [];

  for (const order of orders) {
    const ip = cleanIpAddress(order.ipAddress);
    if (!ip) continue;

    if (!shouldSyncPanelDataToOrder(order, syncCtx)) {
      skipped.push({
        orderId: String(order._id),
        ipAddress: ip,
        reason: 'not_current_ip_owner',
      });
      continue;
    }

    const entry = ipIndex.get(ip);
    if (!entry) {
      failed.push({
        orderId: String(order._id),
        ipAddress: ip,
        error: `No VM found on Hostheaven for IP ${ip}`,
      });
      continue;
    }

    let panelExpiry = entry.expiryDate;
    if (!panelExpiry && entry.vmId && api) {
      try {
        const details = await api.getVmDetails(entry.vmId);
        panelExpiry = ResellerApi.extractVmExpiryDate(entry.raw, details);
      } catch {
        // overview often has expiresAt — details optional
      }
    }

    if (!panelExpiry) {
      failed.push({
        orderId: String(order._id),
        ipAddress: ip,
        error: `Hostheaven did not return expiry for IP ${ip}`,
      });
      continue;
    }

    const before = expiryMs(order.expiryDate);
    const after = expiryMs(panelExpiry);
    const orderUpdates = { lastSyncTime: new Date() };
    if (entry.vmId && !order.resellerVmId) {
      orderUpdates.resellerVmId = String(entry.vmId);
      orderUpdates.provider = 'reseller-api';
    }

    const extendsCustomer = panelExpiryExtendsCustomer(order.expiryDate, panelExpiry);
    const shouldUpdate = shouldApplyPanelExpiryToCustomer(order.expiryDate, panelExpiry);

    if (!shouldUpdate) {
      if (orderUpdates.resellerVmId) {
        await Order.findByIdAndUpdate(order._id, orderUpdates);
      }
      skipped.push({ orderId: String(order._id), ipAddress: ip, expiryDate: panelExpiry });
      continue;
    }

    orderUpdates.expiryDate = panelExpiry;
    await Order.findByIdAndUpdate(order._id, orderUpdates);

    if (order.inventoryItemId) {
      const IPStock = require('@/models/ipStockModel');
      await IPStock.updateOne(
        { 'inventoryItems._id': order.inventoryItemId },
        { $set: { 'inventoryItems.$.expiryDate': panelExpiry } }
      );
    }

    updated.push({
      orderId: String(order._id),
      ipAddress: ip,
      previousExpiry: order.expiryDate,
      expiryDate: panelExpiry,
      extended: extendsCustomer,
    });
  }

  return { updated, skipped, failed };
}

/**
 * Pull one order's expiry from Hostheaven panel (by IP). Used on customer order page load.
 */
async function syncSingleOrderExpiryFromPanel(order, { force = false, companyDoc = null } = {}) {
  if (!order?.ipAddress || !order?.ipStockId) {
    return { order, synced: false };
  }

  const IPStock = require('@/models/ipStockModel');
  const Order = (await import('@/models/orderModel')).default;
  const Company = (await import('@/models/companyModel')).default;

  const ipStock = await IPStock.findById(order.ipStockId).select('company inventoryItems').lean();
  if (!ipStock?.company) return { order, synced: false };

  const company =
    companyDoc || (await Company.findById(ipStock.company).select('resellerApi name').lean());
  if (!getCompanyResellerApiConfig(company)) return { order, synced: false };

  const { ownerByIp, ownerByItemId } = buildInventoryOwnerMaps([ipStock]);
  if (!shouldSyncPanelDataToOrder(order, { ownerByIp, ownerByItemId })) {
    return { order, synced: false, reason: 'not_current_ip_owner' };
  }

  if (!force && order.lastSyncTime) {
    const age = Date.now() - new Date(order.lastSyncTime).getTime();
    if (age < EXPIRY_FETCH_COOLDOWN_MS) {
      return { order, synced: false, reason: 'cooldown' };
    }
  }

  let panel;
  try {
    panel = await fetchResellerExpiryByIp(company, order.ipAddress);
  } catch (err) {
    return { order, synced: false, error: err.message };
  }

  const extendsCustomer = panelExpiryExtendsCustomer(order.expiryDate, panel.expiryDate);
  const shouldUpdate = shouldApplyPanelExpiryToCustomer(order.expiryDate, panel.expiryDate);

  const updates = { lastSyncTime: new Date() };
  if (panel.vmId && !order.resellerVmId) {
    updates.resellerVmId = String(panel.vmId);
    updates.provider = 'reseller-api';
  }

  if (shouldUpdate) {
    updates.expiryDate = panel.expiryDate;
  }

  const updated = await Order.findByIdAndUpdate(order._id, updates, { new: true }).lean();

  if (shouldUpdate && order.inventoryItemId) {
    await IPStock.updateOne(
      { 'inventoryItems._id': order.inventoryItemId },
      { $set: { 'inventoryItems.$.expiryDate': panel.expiryDate } }
    );
  }

  return {
    order: updated,
    synced: shouldUpdate,
    extended: extendsCustomer,
    expiryDate: panel.expiryDate,
  };
}

/**
 * On dashboard order list — if Hostheaven panel expiry is later, extend customer orders.
 * Uses one overview fetch per company (not one API call per order).
 */
async function syncUserHostheavenOrderExpiries(orders) {
  if (!Array.isArray(orders) || !orders.length) {
    return { orders, updated: 0, extended: 0 };
  }

  const IPStock = require('@/models/ipStockModel');
  const Order = (await import('@/models/orderModel')).default;
  const Company = (await import('@/models/companyModel')).default;

  const stockIds = [...new Set(orders.map((o) => String(o.ipStockId || '')).filter(Boolean))];
  if (!stockIds.length) return { orders, updated: 0, extended: 0 };

  const stocks = await IPStock.find({ _id: { $in: stockIds } }).select('company inventoryItems').lean();
  const stockToCompany = new Map(stocks.map((s) => [String(s._id), String(s.company)]));
  const { ownerByIp, ownerByItemId } = buildInventoryOwnerMaps(stocks);
  const ordersByIp = groupOrdersByIp(orders);
  const syncCtx = { ownerByIp, ownerByItemId, ordersByIp };

  const companyIds = [...new Set(stocks.map((s) => String(s.company)).filter(Boolean))];
  const companies = await Company.find({ _id: { $in: companyIds } }).select('resellerApi name').lean();
  const companyById = new Map(companies.map((c) => [String(c._id), c]));

  const byCompany = new Map();
  for (const order of orders) {
    if (!order?.ipAddress || !order?.ipStockId) continue;
    const companyId = stockToCompany.get(String(order.ipStockId));
    if (!companyId || !getCompanyResellerApiConfig(companyById.get(companyId))) continue;
    const bucket = byCompany.get(companyId) || [];
    bucket.push(order);
    byCompany.set(companyId, bucket);
  }

  if (!byCompany.size) return { orders, updated: 0, extended: 0 };

  const orderById = new Map(orders.map((o) => [String(o._id), { ...o }]));
  let updated = 0;
  let extended = 0;

  for (const [companyId, companyOrders] of byCompany) {
    const company = companyById.get(companyId);
    let ipIndex;
    try {
      const api = createResellerApiClient(company);
      ipIndex = await api.buildVmIpIndex();
    } catch (err) {
      console.warn('[HOSTHEAVEN-EXPIRY] User list sync overview failed:', err.message);
      continue;
    }

    for (const order of companyOrders) {
      const ip = cleanIpAddress(order.ipAddress);
      const entry = ipIndex.get(ip);
      if (!entry?.expiryDate) continue;

      if (!shouldSyncPanelDataToOrder(order, syncCtx)) continue;

      if (!panelExpiryExtendsCustomer(order.expiryDate, entry.expiryDate)) continue;

      await Order.findByIdAndUpdate(order._id, {
        expiryDate: entry.expiryDate,
        lastSyncTime: new Date(),
        ...(entry.vmId && !order.resellerVmId
          ? { resellerVmId: String(entry.vmId), provider: 'reseller-api' }
          : {}),
      });

      if (order.inventoryItemId) {
        await IPStock.updateOne(
          { 'inventoryItems._id': order.inventoryItemId },
          { $set: { 'inventoryItems.$.expiryDate': entry.expiryDate } }
        );
      }

      const fresh = { ...order, expiryDate: entry.expiryDate };
      orderById.set(String(order._id), fresh);
      updated += 1;
      extended += 1;
    }
  }

  return {
    orders: orders.map((o) => orderById.get(String(o._id)) || o),
    updated,
    extended,
  };
}

/**
 * After panel renew — prefer panel expiry, especially when panel already has more validity.
 */
async function resolveRenewalExpiryFromPanel(order, calculatedExpiry, { panelRenew = null } = {}) {
  if (panelRenew?.success && panelRenew.newExpiryDate) {
    return panelRenew.newExpiryDate;
  }

  let panelExpiry = panelRenew?.newExpiryDate || null;

  if (!order?.ipAddress || !order?.ipStockId) {
    return panelExpiry || calculatedExpiry;
  }

  try {
    const IPStock = require('@/models/ipStockModel');
    const Company = (await import('@/models/companyModel')).default;
    const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
    if (!ipStock?.company) return panelExpiry || calculatedExpiry;

    const company = await Company.findById(ipStock.company).select('resellerApi name').lean();
    if (!getCompanyResellerApiConfig(company)) return panelExpiry || calculatedExpiry;

    const panel = await fetchResellerExpiryByIp(company, order.ipAddress);
    panelExpiry = panel?.expiryDate || panelExpiry;
  } catch {
    // keep calculated fallback
  }

  const calcMs = expiryMs(calculatedExpiry);
  const panelMs = expiryMs(panelExpiry);

  if (panelMs != null && (calcMs == null || panelMs > calcMs)) {
    return panelExpiry;
  }
  if (panelMs != null && panelMs !== calcMs) {
    return panelExpiry;
  }

  return calculatedExpiry;
}

module.exports = {
  fetchResellerCredentialsByIp,
  fetchResellerExpiryByIp,
  syncAllInventoryExpiriesFromReseller,
  syncCompanyOrderExpiriesFromPanelIndex,
  syncSingleOrderExpiryFromPanel,
  syncUserHostheavenOrderExpiries,
  resolveRenewalExpiryFromPanel,
  panelExpiryExtendsCustomer,
  EXPIRY_FETCH_COOLDOWN_MS,
};
