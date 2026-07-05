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

/**
 * Poll overview until a VM appears for a fresh purchase (by upstream orderId or newest row).
 */
async function waitForProvisionedVm(api, { resellerOrderId, maxWaitMs = 180_000, pollMs = 5000 } = {}) {
  const deadline = Date.now() + maxWaitMs;
  let lastOverview = null;

  while (Date.now() < deadline) {
    let page = 0;
    let totalPages = 1;
    while (page < Math.min(totalPages, 10)) {
      const data = await api.getOrderOverviewPage(page, 20);
      lastOverview = data;
      const orders = data?.orders || data?.content || [];
      totalPages = Number(data?.totalPages || 1) || 1;

      for (const row of orders) {
        const rowOrderId = row?.orderId ?? row?.purchaseOrderId ?? row?.id;
        const vmId = row?.virtualMachineId ?? row?.vmId ?? row?.vmid;
        if (!vmId) continue;

        const matchByOrder = resellerOrderId != null &&
          String(rowOrderId) === String(resellerOrderId);
        if (matchByOrder || (!resellerOrderId && orders.indexOf(row) === 0)) {
          const ips = ResellerApi.extractOverviewRowIps(row);
          let details = null;
          try {
            details = await api.getVmDetails(String(vmId));
          } catch (_) { /* details may lag */ }

          const ip = ips[0] ||
            details?.ipAddress ||
            details?.ip ||
            null;
          const password = ResellerApi.extractVmPassword(details);
          const username = ResellerApi.extractVmUsername(details);
          const expiryDate = ResellerApi.extractVmExpiryDate(row, details);

          if (ip || password) {
            return {
              vmId: String(vmId),
              ip,
              password,
              username,
              expiryDate,
              raw: row,
            };
          }
        }
      }
      page++;
    }

    await sleep(pollMs);
  }

  return { pending: true, lastOverview };
}

async function syncResellerVmCredentials(api, order, vmId) {
  const details = await api.getVmDetails(vmId);
  const password = ResellerApi.extractVmPassword(details);
  const username = ResellerApi.extractVmUsername(details);
  const os = ResellerApi.extractVmOs(details);
  const ip = details?.ipAddress || details?.ip || order.ipAddress || null;
  const expiryDate = ResellerApi.extractVmExpiryDate(details);

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

module.exports = {
  sleep,
  resolveResellerApiConfigFromCompany,
  buildRenewBody,
  resolveVmId,
  waitForProvisionedVm,
  syncResellerVmCredentials,
  renewResellerPanelVm,
};
