/**
 * PrimeVPS / Hostheaven panel — provision polling, renew, credential sync.
 */

const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const {
  readResellerApiStockConfig,
  resolvePriceIdsForMemory,
  resolveZoneIsoIdFromCatalog,
  autoResolveResellerPriceIds,
} = require('@/lib/resellerApiStockConfig');
const { parseAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const {
  defaultOsForProduct,
  normalizePanelOsForOrder,
  normalizePanelUsernameForOrder,
} = require('@/lib/orderOs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveResellerApiConfigFromCompany(company) {
  return getCompanyResellerApiConfig(company);
}

function buildRenewBody(vmId, order, stockCfg, priceIds) {
  return {
    vmId: Number(vmId),
    monthsToAdd: 1,
    planType: stockCfg.planType || 'SHARED',
    useWalletBalance: true,
    cpuPriceId: priceIds.cpuPriceId,
    ramPriceId: priceIds.ramPriceId,
    diskPriceId: priceIds.diskPriceId,
    bandwidthPriceId: priceIds.bandwidthPriceId,
  };
}

async function resolveVmId(api, order) {
  if (order.resellerVmId) return String(order.resellerVmId);
  const ip = order.ipAddress ||
    order.serverDetails?.rawDetails?.ips?.[0] ||
    order.serviceDetails?.ipAddress;
  if (!ip) return null;
  const found = await api.findVmByIp(ip);
  return found?.vmId || null;
}

function extractOverviewVmId(row) {
  return row?.virtualMachineId ?? row?.vmId ?? row?.vmid ?? null;
}

function collectOverviewOrderIds(row) {
  return [
    row?.orderId,
    row?.purchaseOrderId,
    row?.orderReference,
    row?.transactionId,
    row?.id,
    row?.groupId,
    row?.bulkGroupId,
    row?.purchaseGroupId,
  ]
    .filter(Boolean)
    .map(String);
}

function overviewRowMatchesPurchase(row, { resellerOrderId, resellerGroupId, resellerVmId } = {}) {
  const vmId = extractOverviewVmId(row);
  if (resellerVmId && vmId && String(vmId) === String(resellerVmId)) return true;

  const rowIds = collectOverviewOrderIds(row);
  if (resellerOrderId && rowIds.some((id) => id === String(resellerOrderId))) return true;
  if (resellerGroupId && rowIds.some((id) => id.includes(String(resellerGroupId)))) return true;

  // createVm returns numeric id (1103) — overview row may expose it only on nested refs
  if (resellerOrderId && /^\d+$/.test(String(resellerOrderId))) {
    const needle = String(resellerOrderId);
    if (rowIds.some((id) => id.endsWith(needle) || id.includes(`-${needle}`))) return true;
  }

  return false;
}

async function getAssignedResellerVmIds(excludeOrderId = null) {
  const Order = (await import('@/models/orderModel')).default;
  const query = { resellerVmId: { $exists: true, $nin: [null, ''] } };
  if (excludeOrderId) query._id = { $ne: excludeOrderId };
  const rows = await Order.find(query).select('resellerVmId').lean();
  return new Set(rows.map((r) => String(r.resellerVmId)).filter(Boolean));
}

async function pickBestRecentCandidate(api, candidates, purchaseStartedAt, excludeVmIds = new Set()) {
  const scored = [];
  for (const row of candidates) {
    const vmId = extractOverviewVmId(row);
    if (!vmId || excludeVmIds.has(String(vmId))) continue;
    try {
      const details = await api.getVmDetails(String(vmId));
      const created = details?.createdAt ? new Date(details.createdAt).getTime() : 0;
      if (created >= purchaseStartedAt - 180_000) {
        scored.push({ row, diff: Math.abs(created - purchaseStartedAt) });
      }
    } catch {
      /* details may lag */
    }
  }
  scored.sort((a, b) => a.diff - b.diff);
  return scored[0]?.row || null;
}

async function resolveOverviewRowForVm(api, vmId, { maxPages = 5 } = {}) {
  if (!vmId) return null;
  for (let page = 0; page < maxPages; page++) {
    const data = await api.getOrderOverviewPage(page, 20);
    const orders = data?.orders || data?.content || data?.items || [];
    const row = orders.find((r) => String(extractOverviewVmId(r)) === String(vmId));
    if (row) return row;
    const totalPages = Number(data?.totalPages || data?.totalPage || 1) || 1;
    if (page + 1 >= totalPages || orders.length === 0) break;
  }
  return null;
}

async function isRecentPanelVm(api, row, purchaseStartedAt) {
  const vmId = extractOverviewVmId(row);
  if (!vmId || !purchaseStartedAt) return false;
  try {
    const details = await api.getVmDetails(String(vmId));
    const created = details?.createdAt ? new Date(details.createdAt).getTime() : 0;
    return created >= purchaseStartedAt - 120_000;
  } catch {
    return false;
  }
}

async function hydrateProvisionedRow(api, row, order = null) {
  const vmId = extractOverviewVmId(row);
  if (!vmId) return null;

  const ips = ResellerApi.extractOverviewRowIps(row);
  let details = null;
  try {
    details = await api.getVmDetails(String(vmId));
  } catch (_) { /* details may lag */ }

  const ip = ips[0] || details?.ipAddress || details?.ip || null;
  const password = ResellerApi.extractVmPassword(details);
  const rawUsername = ResellerApi.extractVmUsername(details);
  const rawOs = ResellerApi.extractVmOs(details);
  const productName = order?.productName || '';
  const username = normalizePanelUsernameForOrder(rawUsername, productName, order?.username);
  const os = normalizePanelOsForOrder(rawOs, productName, order?.os);
  const expiryDate = ResellerApi.extractVmExpiryDate(row, details);

  if (!ip && !password) return null;

  return {
    vmId: String(vmId),
    ip,
    password,
    username,
    os,
    expiryDate,
    raw: row,
  };
}

/**
 * Poll overview until a VM appears for a fresh purchase.
 * primevm.in create returns numeric orderId (e.g. 1102) but overview uses ORD-… strings —
 * we also match groupId, vmId, and recently-created VMs.
 */
async function waitForProvisionedVm(
  api,
  {
    resellerOrderId,
    resellerGroupId,
    resellerVmId,
    purchaseStartedAt,
    excludeOrderId = null,
    order = null,
    maxWaitMs = 180_000,
    pollMs = 5000,
  } = {}
) {
  const deadline = Date.now() + maxWaitMs;
  const purchaseAt = purchaseStartedAt || Date.now();
  let lastOverview = null;
  const assignedVmIds = await getAssignedResellerVmIds(excludeOrderId);

  while (Date.now() < deadline) {
    let page = 0;
    let totalPages = 1;
    const recentCandidates = [];

    while (page < Math.min(totalPages, 10)) {
      const data = await api.getOrderOverviewPage(page, 20);
      lastOverview = data;
      const orders = data?.orders || data?.content || data?.items || [];
      totalPages = Number(data?.totalPages || data?.totalPage || 1) || 1;

      for (const row of orders) {
        const vmId = extractOverviewVmId(row);
        if (!vmId) continue;

        const matched = overviewRowMatchesPurchase(row, {
          resellerOrderId,
          resellerGroupId,
          resellerVmId,
        });

        if (matched) {
          const hydrated = await hydrateProvisionedRow(api, row, order);
          if (hydrated) return hydrated;
        }

        if (resellerOrderId || resellerGroupId || purchaseStartedAt) {
          if (await isRecentPanelVm(api, row, purchaseAt)) {
            recentCandidates.push(row);
          }
        } else if (orders.indexOf(row) === 0) {
          const hydrated = await hydrateProvisionedRow(api, row, order);
          if (hydrated) return hydrated;
        }
      }
      page++;
    }

    if (recentCandidates.length > 0) {
      const best = recentCandidates.length === 1
        ? recentCandidates[0]
        : await pickBestRecentCandidate(api, recentCandidates, purchaseAt, assignedVmIds);
      if (best) {
        const hydrated = await hydrateProvisionedRow(api, best, order);
        if (hydrated) return hydrated;
      }
    }

    await sleep(pollMs);
  }

  return { pending: true, lastOverview };
}

async function syncResellerVmCredentials(api, order, vmId) {
  const details = await api.getVmDetails(vmId);
  const overviewRow = await resolveOverviewRowForVm(api, vmId);
  const password = ResellerApi.extractVmPassword(details);
  const rawUsername = ResellerApi.extractVmUsername(details);
  const rawOs = ResellerApi.extractVmOs(details);
  const username = normalizePanelUsernameForOrder(rawUsername, order.productName, order.username);
  const os = normalizePanelOsForOrder(rawOs, order.productName, order.os);
  const ip =
    ResellerApi.extractOverviewRowIp(overviewRow) ||
    details?.ipAddress ||
    details?.ip ||
    order.ipAddress ||
    null;
  const expiryDate = ResellerApi.extractVmExpiryDate(overviewRow, details);

  const updates = { lastSyncTime: new Date() };
  const changes = [];

  if (password && password !== order.password) {
    updates.password = password;
    changes.push('password');
  }
  if (username && username !== order.username) {
    updates.username = username;
    changes.push('username');
  }
  if (ip && ip !== order.ipAddress) {
    updates.ipAddress = ip;
    changes.push('ipAddress');
  }
  if (expiryDate && String(expiryDate) !== String(order.expiryDate || '')) {
    updates.expiryDate = expiryDate;
    changes.push('expiryDate');
  }
  if (os && os !== order.os) {
    updates.os = os;
    changes.push('os');
  }

  return { updates, changes, details };
}

/**
 * Call upstream renew (wallet) for an OceanLinux order linked to a reseller panel VM.
 */
async function renewResellerPanelVm({ api, order, ipStock, Order }) {
  const stockCfg = readResellerApiStockConfig(ipStock);
  const vmId = await resolveVmId(api, order);
  if (!vmId) {
    return { success: false, error: 'No VM found on reseller panel for this order' };
  }

  let priceIds = resolvePriceIdsForMemory(stockCfg, order.memory);
  if (!priceIds?.cpuPriceId) {
    priceIds = await autoResolveResellerPriceIds(api, {
      memory: order.memory,
      planType: stockCfg.planType,
    });
  }

  const renewBody = buildRenewBody(vmId, order, stockCfg, priceIds);

  try {
    await api.calculateRenewal(renewBody);
  } catch (calcErr) {
    console.warn('[RESELLER-RENEW] calculate-renewal warning:', calcErr.message);
  }

  const gateway = stockCfg.gateway || 'WALLET';
  const renewRes = await api.upgradeRenew(vmId, renewBody, { gateway });

  let newExpiryDate = null;
  try {
    const details = await api.getVmDetails(vmId);
    newExpiryDate = ResellerApi.extractVmExpiryDate(details) || parseAdvpsExpiryDate(renewRes?.expiresAt);
  } catch (_) { /* best effort */ }

  if (Order && order._id) {
    await Order.findByIdAndUpdate(order._id, {
      resellerVmId: vmId,
      provider: 'reseller-api',
      ...(newExpiryDate ? {} : {}),
    });
  }

  return {
    success: true,
    vmId,
    upstream: renewRes,
    newExpiryDate,
  };
}

/**
 * Resume a stuck reseller order — panel VM exists but IP/password not saved yet.
 */
async function completeResellerPendingOrder(order, ipStock, { api: existingApi = null } = {}) {
  const Company = (await import('@/models/companyModel')).default;
  const Order = (await import('@/models/orderModel')).default;

  let api = existingApi;
  if (!api) {
    if (!ipStock?.company) return { success: false, error: 'No company on IP stock' };
    const company = await Company.findById(ipStock.company).select('resellerApi name').lean();
    const cfg = getCompanyResellerApiConfig(company);
    if (!cfg) return { success: false, error: 'Reseller API not configured' };
    api = new ResellerApi(cfg);
  }

  const purchaseStartedAt = order.createdAt
    ? new Date(order.createdAt).getTime()
    : Date.now() - 600_000;

  let provisioned = null;

  if (order.resellerVmId) {
    try {
      const synced = await syncResellerVmCredentials(api, order, order.resellerVmId);
      if (synced.updates.ipAddress || synced.updates.password) {
        provisioned = {
          vmId: String(order.resellerVmId),
          ip: synced.updates.ipAddress || order.ipAddress,
          password: synced.updates.password || order.password,
          username: synced.updates.username || order.username,
          os: synced.updates.os || order.os,
          expiryDate: synced.updates.expiryDate || order.expiryDate,
        };
      }
    } catch (_) { /* fall through to overview poll */ }
  }

  if (!provisioned?.ip || !provisioned?.password) {
    provisioned = await waitForProvisionedVm(api, {
      resellerOrderId: order.resellerOrderId || null,
      resellerGroupId: order.resellerGroupId || null,
      resellerVmId: order.resellerVmId || null,
      purchaseStartedAt,
      excludeOrderId: order._id,
      order,
      maxWaitMs: 90_000,
      pollMs: 3000,
    });
  }

  if (provisioned?.pending) {
    return { success: false, pending: true, error: 'Panel VM still pending IP/credentials' };
  }

  if (!provisioned?.vmId && !provisioned?.ip && !provisioned?.password) {
    return { success: false, error: 'No VM found on panel for this order' };
  }

  const username = normalizePanelUsernameForOrder(
    provisioned.username,
    order.productName,
    order.username
  );
  const os = normalizePanelOsForOrder(provisioned.os, order.productName, order.os);
  const ipAddress = provisioned.ip || order.ipAddress || '';
  const password = provisioned.password || order.password || '';
  const fullyProvisioned = !!(ipAddress && (password || provisioned.vmId));

  let expiryDate = provisioned.expiryDate || order.expiryDate;
  if (!expiryDate) {
    const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
    expiryDate = calculateCompanyExpiryDate();
  }

  await Order.findByIdAndUpdate(order._id, {
    status: fullyProvisioned ? 'active' : 'confirmed',
    provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
    provisioningError: fullyProvisioned ? '' : 'PENDING: awaiting IP/password from panel',
    provider: 'reseller-api',
    resellerVmId: provisioned.vmId || order.resellerVmId || undefined,
    ipAddress,
    username,
    password,
    os,
    expiryDate,
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
  });

  return {
    success: fullyProvisioned,
    ipAddress,
    vmId: provisioned.vmId || order.resellerVmId,
    pending: !fullyProvisioned,
  };
}

async function syncStuckResellerPendingOrders({ limit = 5 } = {}) {
  const Order = (await import('@/models/orderModel')).default;
  const IPStock = require('@/models/ipStockModel');

  const stuck = await Order.find({
    $and: [
      {
        $or: [
          { ipAddress: { $in: [null, ''] } },
          { ipAddress: { $exists: false } },
          { password: { $in: [null, ''] } },
          { password: { $exists: false } },
        ],
      },
      {
        $or: [
          { provider: 'reseller-api' },
          { resellerOrderId: { $exists: true, $nin: [null, ''] } },
          { resellerVmId: { $exists: true, $nin: [null, ''] } },
        ],
      },
    ],
    provisioningStatus: { $in: ['provisioning', 'failed', 'pending', 'in_progress', ''] },
    status: { $in: ['confirmed', 'active', 'pending'] },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = [];
  for (const order of stuck) {
    try {
      const ipStock = order.ipStockId
        ? await IPStock.findById(order.ipStockId)
        : null;
      if (!ipStock) {
        results.push({ orderId: String(order._id), success: false, error: 'No ipStockId' });
        continue;
      }
      const out = await completeResellerPendingOrder(order, ipStock);
      results.push({ orderId: String(order._id), ...out });
    } catch (err) {
      results.push({ orderId: String(order._id), success: false, error: err.message });
    }
  }
  return results;
}

const RESELLER_FETCH_SYNC_COOLDOWN_MS = 8000;

/**
 * When customer opens manage order, pull IP/credentials from panel if still missing.
 */
async function maybeSyncResellerOrderOnFetch(order) {
  if (!order) return order;
  const ip = (order.ipAddress || '').trim();
  const pwd = (order.password || '').trim();
  if (ip && pwd) return order;

  const hasPanelRef =
    (order.resellerOrderId && String(order.resellerOrderId).trim()) ||
    (order.resellerVmId && String(order.resellerVmId).trim());
  if (!hasPanelRef && order.provider !== 'reseller-api') return order;

  const lastAttempt = order.lastProvisionAttempt
    ? new Date(order.lastProvisionAttempt).getTime()
    : 0;
  if (Date.now() - lastAttempt < RESELLER_FETCH_SYNC_COOLDOWN_MS) return order;

  const IPStock = require('@/models/ipStockModel');
  const ipStock = order.ipStockId ? await IPStock.findById(order.ipStockId) : null;
  if (!ipStock) return order;

  try {
    await completeResellerPendingOrder(order, ipStock);
    const Order = (await import('@/models/orderModel')).default;
    return await Order.findById(order._id).lean();
  } catch (err) {
    console.warn('[RESELLER-SYNC] Order fetch sync failed:', err.message);
    return order;
  }
}

module.exports = {
  sleep,
  resolveResellerApiConfigFromCompany,
  buildRenewBody,
  resolveVmId,
  waitForProvisionedVm,
  syncResellerVmCredentials,
  renewResellerPanelVm,
  completeResellerPendingOrder,
  syncStuckResellerPendingOrders,
  maybeSyncResellerOrderOnFetch,
};
