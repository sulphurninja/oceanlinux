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
  resolveEffectiveResellerPlanType,
  resolveResellerZoneCandidatesForPurchase,
  resolveExpectedZoneIds,
  resolveCouponCodeForMemory,
  resolvePriceIdsForVmSpec,
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

/** e.g. "🖥️ 103.129.xx Windows VPS" → "103.129", "160.191.137 ..." → "160.191.137" */
function extractExpectedIpPrefix(ipStock, order) {
  const texts = [
    order?.productName,
    ipStock?.name,
    ipStock?.defaultConfigurations?.resellerApi?.zoneName,
  ];
  for (const text of texts) {
    const raw = String(text || '');
    const clean = raw.replace(/[^\d.]/g, '');
    const full = clean.match(/^(\d{1,3}(?:\.\d{1,3}){1,2})/);
    if (full) return full[1];
    const partial = raw.match(/\b(\d{1,3}\.\d{1,3})\b/);
    if (partial) return partial[1];
  }
  return null;
}

function resolveExpectedZoneId(ipStock) {
  const ids = resolveExpectedZoneIds(ipStock);
  return ids[0] ?? null;
}

function buildResellerLocationContext(ipStock, order) {
  const expectedZoneIds = resolveExpectedZoneIds(ipStock);
  return {
    expectedZoneId: expectedZoneIds[0] ?? null,
    expectedZoneIds,
    expectedIpPrefix: extractExpectedIpPrefix(ipStock, order),
  };
}

function zoneIdAllowed(zoneId, ctx = {}) {
  if (zoneId == null) return true;
  const allowed = Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length
    ? ctx.expectedZoneIds
    : ctx.expectedZoneId != null
      ? [ctx.expectedZoneId]
      : [];
  if (!allowed.length) return true;
  return allowed.some((id) => Number(id) === Number(zoneId));
}

function ipMatchesOrderedRange(ip, expectedPrefix) {
  if (!expectedPrefix || !ip) return true;
  const ipStr = String(ip).trim();
  if (ipStr.startsWith(expectedPrefix)) return true;
  const prefixOctets = String(expectedPrefix).split('.').filter(Boolean);
  const ipOctets = ipStr.split('.');
  if (prefixOctets.length >= 2 && ipOctets.length >= 2) {
    return prefixOctets[0] === ipOctets[0] && prefixOctets[1] === ipOctets[1];
  }
  return false;
}

function extractVmZoneId(details) {
  return details?.zoneId ?? details?.zone?.id ?? details?.zone?.zoneId ?? null;
}

async function rowMatchesOrderLocation(api, row, ctx = {}) {
  const { expectedZoneId, expectedIpPrefix } = ctx;
  if (!expectedZoneId && !(Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length) && !expectedIpPrefix) {
    return true;
  }

  const rowIp = ResellerApi.extractOverviewRowIp(row);
  if (expectedIpPrefix && rowIp && !ipMatchesOrderedRange(rowIp, expectedIpPrefix)) {
    return false;
  }

  if (expectedZoneId || (Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length)) {
    const vmId = extractOverviewVmId(row);
    if (!vmId) return false;
    try {
      const details = await api.getVmDetails(String(vmId));
      const zoneId = extractVmZoneId(details);
      if (zoneId != null && !zoneIdAllowed(zoneId, ctx)) return false;
    } catch {
      return false;
    }
  }

  return true;
}

function provisionedMatchesOrderLocation(provisioned, { expectedZoneId, expectedIpPrefix } = {}) {
  if (!provisioned?.ip && !provisioned?.vmId) return false;
  if (expectedIpPrefix && provisioned.ip && !ipMatchesOrderedRange(provisioned.ip, expectedIpPrefix)) {
    return false;
  }
  return true;
}

async function provisionedMatchesOrderLocationAsync(api, provisioned, ctx = {}) {
  if (!provisionedMatchesOrderLocation(provisioned, ctx)) return false;
  if ((!ctx.expectedZoneId && !(Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length)) || !provisioned?.vmId) {
    return true;
  }
  try {
    const details = await api.getVmDetails(String(provisioned.vmId));
    const zoneId = extractVmZoneId(details);
    if (zoneId != null && !zoneIdAllowed(zoneId, ctx)) return false;
  } catch {
    return false;
  }
  return true;
}

function resolveResellerApiConfigFromCompany(company) {
  return getCompanyResellerApiConfig(company);
}

function buildRenewBody(vmId, order, stockCfg, priceIds, { couponCode, planType } = {}) {
  const body = {
    vmId: Number(vmId),
    monthsToAdd: 1,
    planType: planType || priceIds?.planType || resolveEffectiveResellerPlanType(stockCfg, priceIds),
    useWalletBalance: true,
    cpuPriceId: priceIds.cpuPriceId,
    ramPriceId: priceIds.ramPriceId,
    diskPriceId: priceIds.diskPriceId,
    bandwidthPriceId: priceIds.bandwidthPriceId,
  };
  const code = String(couponCode || '').trim().toUpperCase();
  if (code) body.couponCode = code;
  return body;
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

/** Panel rows tagged MIG-* are migrated legacy VMs — never attach to a fresh purchase. */
function isMigrationOverviewRow(row) {
  return collectOverviewOrderIds(row).some((id) => /^MIG-/i.test(id));
}

/** Parse ms timestamp embedded in BULK-1784841176499-F414 or ORD-1784841179868-71A0 refs. */
function extractTimestampFromPurchaseRef(ref) {
  const s = String(ref || '');
  const match = s.match(/(?:BULK|ORD)-(\d{10,})/i);
  return match ? Number(match[1]) : null;
}

/** createVm groupId (BULK-*) often differs slightly from overview VM order ref (ORD-*). */
function purchaseRefsAlign(leftRef, rightRef, windowMs = 120_000) {
  const leftTs = extractTimestampFromPurchaseRef(leftRef);
  const rightTs = extractTimestampFromPurchaseRef(rightRef);
  if (leftTs && rightTs) return Math.abs(leftTs - rightTs) <= windowMs;
  return false;
}

function overviewRowMatchesBulkGroup(row, resellerGroupId) {
  if (!resellerGroupId) return false;
  const rowIds = collectOverviewOrderIds(row);
  return rowIds.some(
    (id) => id.includes(String(resellerGroupId)) || purchaseRefsAlign(resellerGroupId, id)
  );
}

function overviewRowMatchesPurchase(row, { resellerOrderId, resellerGroupId, resellerVmId } = {}) {
  if (isMigrationOverviewRow(row)) return false;

  const vmId = extractOverviewVmId(row);
  const rowIds = collectOverviewOrderIds(row);

  if (resellerGroupId && overviewRowMatchesBulkGroup(row, resellerGroupId)) return true;

  if (resellerOrderId && rowIds.some((id) => id === String(resellerOrderId))) return true;

  // createVm returns numeric id (1103) — overview row may expose it only on nested refs
  if (resellerOrderId && /^\d+$/.test(String(resellerOrderId))) {
    const needle = String(resellerOrderId);
    if (rowIds.some((id) => id.endsWith(needle) || id.includes(`-${needle}`))) return true;
  }

  // Never trust bare vmId from create response — require bulk/order ref alignment when groupId exists
  if (resellerVmId && vmId && String(vmId) === String(resellerVmId)) {
    if (!resellerGroupId && !resellerOrderId) return true;
    if (resellerGroupId && overviewRowMatchesBulkGroup(row, resellerGroupId)) return true;
    if (resellerOrderId && rowIds.some((id) => id === String(resellerOrderId))) return true;
    return false;
  }

  return false;
}

/**
 * Reject vmId returned by createVm when overview shows MIG-* or bulk group mismatch.
 */
async function validateCreatedVmId(api, vmId, { resellerGroupId, resellerOrderId, purchaseStartedAt } = {}) {
  if (!vmId) return false;
  const row = await resolveOverviewRowForVm(api, vmId);
  if (row) {
    if (isMigrationOverviewRow(row)) return false;
    if (resellerGroupId && !overviewRowMatchesBulkGroup(row, resellerGroupId)) return false;
    if (resellerOrderId) {
      const rowIds = collectOverviewOrderIds(row);
      const numeric = /^\d+$/.test(String(resellerOrderId));
      const orderHit = rowIds.some((id) => {
        if (id === String(resellerOrderId)) return true;
        if (numeric) {
          const needle = String(resellerOrderId);
          return id.endsWith(needle) || id.includes(`-${needle}`);
        }
        return false;
      });
      if (!orderHit && resellerGroupId && !overviewRowMatchesBulkGroup(row, resellerGroupId)) return false;
    }
  }
  if (purchaseStartedAt) {
    return isRecentPanelVm(api, row || { virtualMachineId: vmId }, purchaseStartedAt);
  }
  return true;
}

async function getAssignedResellerVmIds(excludeOrderId = null) {
  const Order = (await import('@/models/orderModel')).default;
  const query = { resellerVmId: { $exists: true, $nin: [null, ''] } };
  if (excludeOrderId) query._id = { $ne: excludeOrderId };
  const rows = await Order.find(query).select('resellerVmId').lean();
  return new Set(rows.map((r) => String(r.resellerVmId)).filter(Boolean));
}

async function pickBestRecentCandidate(
  api,
  candidates,
  purchaseStartedAt,
  excludeVmIds = new Set(),
  locationCtx = {}
) {
  const scored = [];
  for (const row of candidates) {
    const vmId = extractOverviewVmId(row);
    if (!vmId || excludeVmIds.has(String(vmId))) continue;
    if (isMigrationOverviewRow(row)) continue;
    if (!(await rowMatchesOrderLocation(api, row, locationCtx))) continue;
    try {
      const details = await api.getVmDetails(String(vmId));
      const created = details?.createdAt ? new Date(details.createdAt).getTime() : 0;
      if (created >= purchaseStartedAt - 180_000) {
        scored.push({ row, diff: Math.abs(created - purchaseStartedAt), vmId: String(vmId) });
      }
    } catch {
      /* details may lag */
    }
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.diff - b.diff);
  // Ambiguous — two VMs created within 30s: do not guess (prevents IP swap)
  if (scored.length > 1 && scored[1].diff - scored[0].diff < 30_000) {
    return null;
  }
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
  if (isMigrationOverviewRow(row)) return false;
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
    expectedZoneId = null,
    expectedZoneIds = null,
    expectedIpPrefix = null,
    maxWaitMs = 180_000,
    pollMs = 5000,
  } = {}
) {
  const deadline = Date.now() + maxWaitMs;
  const purchaseAt = purchaseStartedAt || Date.now();
  let lastOverview = null;
  const locationCtx = {
    expectedZoneId,
    expectedZoneIds: Array.isArray(expectedZoneIds) ? expectedZoneIds : undefined,
    expectedIpPrefix,
  };

  while (Date.now() < deadline) {
    const assignedVmIds = await getAssignedResellerVmIds(excludeOrderId);
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
        if (assignedVmIds.has(String(vmId))) continue;

        const matched = overviewRowMatchesPurchase(row, {
          resellerOrderId,
          resellerGroupId,
          resellerVmId,
        });

        if (matched) {
          if (!(await rowMatchesOrderLocation(api, row, locationCtx))) continue;
          const hydrated = await hydrateProvisionedRow(api, row, order);
          if (hydrated && (await provisionedMatchesOrderLocationAsync(api, hydrated, locationCtx))) {
            return hydrated;
          }
        }

        if (resellerOrderId || resellerGroupId || purchaseStartedAt) {
          if (await isRecentPanelVm(api, row, purchaseAt)) {
            if (await rowMatchesOrderLocation(api, row, locationCtx)) {
              recentCandidates.push(row);
            }
          }
        } else if (orders.indexOf(row) === 0) {
          const hydrated = await hydrateProvisionedRow(api, row, order);
          if (hydrated) return hydrated;
        }
      }
      page++;
    }

    if (recentCandidates.length > 0) {
      const best = await pickBestRecentCandidate(
        api,
        recentCandidates,
        purchaseAt,
        assignedVmIds,
        locationCtx
      );
      if (best) {
        const hydrated = await hydrateProvisionedRow(api, best, order);
        if (hydrated && (await provisionedMatchesOrderLocationAsync(api, hydrated, locationCtx))) {
          return hydrated;
        }
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

function isCouponRenewFailure(err) {
  const msg = String(err?.message || err?.body?.error || err?.body?.message || '').toLowerCase();
  return /coupon|minimum order amount|promo/i.test(msg);
}

function couponAppliedOnCalculate(calc) {
  if (!calc || typeof calc !== 'object') return false;
  const status = String(calc.couponStatus || '').toUpperCase();
  return status === 'APPLIED' || Number(calc.discountAmount) > 0;
}

/** UserSide.pdf: pick the tier closest to the VM's current subscription (proRata 0 = exact match). */
function pickCurrentUpgradeTier(options) {
  if (!Array.isArray(options) || !options.length) return null;
  const zero = options.find((o) => Number(o.proRataUpgradeCost) === 0);
  if (zero?.tier?.id != null) return zero.tier.id;
  const sorted = options
    .slice()
    .sort((a, b) => Number(a.proRataUpgradeCost || 0) - Number(b.proRataUpgradeCost || 0));
  return sorted[0]?.tier?.id ?? null;
}

/**
 * UserSide.pdf renew flow step 1: GET /api/pricing/upgrades/{vmId}
 * Returns price IDs tied to this VM so isSpecChange stays false on renew.
 */
async function resolveRenewPriceIdsFromUpgradeOptions(api, vmId) {
  const opts = await api.getUpgradeOptions(vmId);
  const cpuPriceId = pickCurrentUpgradeTier(opts?.cpuOptions);
  const ramPriceId = pickCurrentUpgradeTier(opts?.ramOptions);
  const diskPriceId = pickCurrentUpgradeTier(opts?.diskOptions);
  const bandwidthPriceId = pickCurrentUpgradeTier(opts?.bandwidthOptions);
  if (!cpuPriceId || !ramPriceId || !diskPriceId || !bandwidthPriceId) return null;

  return {
    planType: String(opts?.currentPlan || 'SHARED').toUpperCase(),
    cpuPriceId,
    ramPriceId,
    diskPriceId,
    bandwidthPriceId,
    fromUpgradeApi: true,
  };
}

async function resolveRenewPriceIds(api, order, stockCfg, { panelPlanType, vmDetails, vmId } = {}) {
  if (vmId) {
    try {
      const fromUpgrade = await resolveRenewPriceIdsFromUpgradeOptions(api, vmId);
      if (fromUpgrade?.cpuPriceId) {
        console.log(`[RESELLER-RENEW] Price IDs from /api/pricing/upgrades/${vmId} (plan ${fromUpgrade.planType})`);
        return fromUpgrade;
      }
    } catch (err) {
      console.warn('[RESELLER-RENEW] getUpgradeOptions failed — falling back to catalog:', err.message);
    }
  }

  const renewPlanType = panelPlanType || stockCfg.planType || 'SHARED';

  if (vmDetails) {
    const fromVm = await resolvePriceIdsForVmSpec(api, vmDetails, { planType: renewPlanType });
    if (fromVm?.cpuPriceId) return fromVm;
  }

  let priceIds = resolvePriceIdsForMemory(stockCfg, order.memory);
  if (!priceIds?.cpuPriceId) {
    priceIds = await autoResolveResellerPriceIds(api, {
      memory: order.memory,
      planType: renewPlanType,
    });
  }
  return priceIds;
}

function overviewPlanType(overviewRow) {
  const raw = overviewRow?.raw || overviewRow || {};
  return String(raw.serverPlan || raw.planType || raw.serverPlanType || '').trim().toUpperCase() || null;
}

function panelExpiryMs(value) {
  if (!value) return null;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Hostheaven sometimes returns COMPLETED but leaves expiresAt unchanged — treat as failure. */
function panelExpiryWasExtended(beforeMs, afterMs, { minDays = 7 } = {}) {
  if (beforeMs == null || afterMs == null) return afterMs != null && afterMs > beforeMs;
  const minMs = minDays * 24 * 60 * 60 * 1000;
  return afterMs - beforeMs >= minMs;
}

async function upgradeRenewWithCouponFallback(api, vmId, renewBody, gateway, { calcWithCoupon } = {}) {
  try {
    const res = await api.upgradeRenew(vmId, renewBody, { gateway });
    return { res, couponUsed: !!renewBody.couponCode };
  } catch (err) {
    if (!renewBody.couponCode || !isCouponRenewFailure(err)) throw err;

    // Coupon was pre-validated on calculate-renewal — do not silently drop it unless
    // the quote never applied the discount (Hostheaven would reject upgrade-renew).
    if (calcWithCoupon && couponAppliedOnCalculate(calcWithCoupon)) {
      throw err;
    }

    console.warn(
      `[RESELLER-RENEW] Coupon renew failed for VM ${vmId} (${renewBody.couponCode}), retrying without coupon:`,
      err.message
    );
    const { couponCode, ...withoutCoupon } = renewBody;
    const res = await api.upgradeRenew(vmId, withoutCoupon, { gateway });
    return { res, couponUsed: false, couponFallback: true };
  }
}

/**
 * Call upstream renew (wallet) for an OceanLinux order linked to a reseller panel VM.
 */
async function renewResellerPanelVm({ api, order, ipStock, Order, companyCoupon = null }) {
  const stockCfg = readResellerApiStockConfig(ipStock);
  const vmId = await resolveVmId(api, order);
  if (!vmId) {
    return { success: false, error: 'No VM found on reseller panel for this order' };
  }

  const overviewRow = await resolveOverviewRowForVm(api, vmId);
  const panelPlanType = overviewPlanType(overviewRow);
  const renewPlanType = panelPlanType || stockCfg.planType || 'SHARED';
  const panelExpiryBefore =
    panelExpiryMs(overviewRow?.raw?.expiresAt) ||
    panelExpiryMs(ResellerApi.extractVmExpiryDate(overviewRow?.raw, overviewRow));

  let vmDetails = null;
  try {
    vmDetails = await api.getVmDetails(vmId);
  } catch (detailsErr) {
    console.warn('[RESELLER-RENEW] getVmDetails failed — price IDs may not match VM spec:', detailsErr.message);
  }

  let priceIds = await resolveRenewPriceIds(api, order, stockCfg, {
    panelPlanType: renewPlanType,
    vmDetails,
    vmId,
  });

  let couponSource = companyCoupon;
  if (!couponSource && ipStock?.company) {
    const Company = (await import('@/models/companyModel')).default;
    const company = await Company.findById(ipStock.company).select('resellerApi').lean();
    const cfg = getCompanyResellerApiConfig(company);
    if (cfg) {
      couponSource = { couponCode: cfg.couponCode, couponByMemory: cfg.couponByMemory };
    }
  }

  const upstreamCoupon = resolveCouponCodeForMemory(stockCfg, order.memory, couponSource || {});
  const renewBody = buildRenewBody(vmId, order, stockCfg, priceIds, {
    couponCode: upstreamCoupon,
  });
  renewBody.planType = priceIds?.planType || panelPlanType || renewPlanType;

  if (upstreamCoupon) {
    console.log(`[RESELLER-RENEW] Upstream coupon ${upstreamCoupon} for ${order.memory} (order ${order._id})`);
  }

  let calcWithCoupon = null;
  try {
    calcWithCoupon = await api.calculateRenewal(renewBody);
    if (upstreamCoupon && !couponAppliedOnCalculate(calcWithCoupon)) {
      console.warn(
        `[RESELLER-RENEW] Coupon ${upstreamCoupon} not applied on calculate-renewal — proceeding without coupon`
      );
      delete renewBody.couponCode;
      calcWithCoupon = await api.calculateRenewal(renewBody);
    } else if (calcWithCoupon?.isSpecChange === true && vmId) {
      console.warn('[RESELLER-RENEW] isSpecChange=true — re-fetching price IDs from /api/pricing/upgrades');
      priceIds = await resolveRenewPriceIdsFromUpgradeOptions(api, vmId);
      if (priceIds?.cpuPriceId) {
        Object.assign(
          renewBody,
          buildRenewBody(vmId, order, stockCfg, priceIds, { couponCode: upstreamCoupon })
        );
        renewBody.planType = priceIds.planType || renewBody.planType;
        calcWithCoupon = await api.calculateRenewal(renewBody);
        if (upstreamCoupon && !couponAppliedOnCalculate(calcWithCoupon)) {
          console.warn(
            `[RESELLER-RENEW] Coupon ${upstreamCoupon} not applied after upgrade re-quote — proceeding without coupon`
          );
          delete renewBody.couponCode;
          calcWithCoupon = await api.calculateRenewal(renewBody);
        }
      }
    }
    if (upstreamCoupon && calcWithCoupon && couponAppliedOnCalculate(calcWithCoupon)) {
      const orderAmount = Number(calcWithCoupon.originalAmount || calcWithCoupon.extensionCost || 0);
      if (orderAmount > 0) {
        try {
          const check = await api.validateCoupon({ code: upstreamCoupon, orderAmount });
          const checkData = check?.data && typeof check.data === 'object' ? check.data : check;
          if (checkData?.valid === true) {
            console.log(
              `[RESELLER-RENEW] Coupon ${upstreamCoupon} validated — ₹${checkData.finalAmount ?? '?'} (was ₹${checkData.originalAmount ?? orderAmount})`
            );
          }
        } catch (validateErr) {
          console.warn('[RESELLER-RENEW] Coupon validate warning:', validateErr.message);
        }
      }
    }
  } catch (calcErr) {
    console.warn('[RESELLER-RENEW] calculate-renewal warning:', calcErr.message);
  }

  let couponUsed = null;

  const gateway = stockCfg.gateway || 'WALLET';
  let renewRes;
  try {
    const out = await upgradeRenewWithCouponFallback(api, vmId, renewBody, gateway, { calcWithCoupon });
    renewRes = out.res;
    couponUsed = out.couponUsed ? upstreamCoupon : out.couponFallback ? null : renewBody.couponCode || null;
  } catch (err) {
    const errMsg = String(err?.body?.error || err.message || '');
    if (/no changes detected/i.test(errMsg)) {
      return {
        success: false,
        error:
          'Hostheaven panel says renewal already applied for this billing cycle — extend manually on panel if expiry is still short.',
        vmId,
        upstream: err.body || null,
        couponUsed: upstreamCoupon || null,
        calcQuote: calcWithCoupon
          ? {
              payableAmount: calcWithCoupon.payableAmount,
              couponStatus: calcWithCoupon.couponStatus,
              isSpecChange: calcWithCoupon.isSpecChange,
            }
          : null,
      };
    }
    return {
      success: false,
      error: err.message,
      vmId,
      upstream: err.body || null,
    };
  }

  let newExpiryDate =
    parseAdvpsExpiryDate(renewRes?.newExpiry || renewRes?.expiresAt) ||
    ResellerApi.extractVmExpiryDate(overviewRow?.raw, overviewRow);

  try {
    const freshOverview = await resolveOverviewRowForVm(api, vmId, { maxPages: 5 });
    newExpiryDate =
      ResellerApi.extractVmExpiryDate(freshOverview?.raw, freshOverview) ||
      newExpiryDate;
    if (!newExpiryDate) {
      const details = await api.getVmDetails(vmId);
      newExpiryDate = ResellerApi.extractVmExpiryDate(details);
    }
  } catch (_) { /* best effort */ }

  const panelExpiryAfter = panelExpiryMs(newExpiryDate);
  if (!panelExpiryWasExtended(panelExpiryBefore, panelExpiryAfter)) {
    const panelMonthly = Number(overviewRow?.raw?.monthlyPrice || 0);
    return {
      success: false,
      error:
        'Hostheaven panel renew completed but expiry did not extend — VM billing spec may not match catalog (extend manually on Hostheaven panel).',
      vmId,
      upstream: renewRes,
      newExpiryDate,
      couponUsed,
      panelPlanType: panelPlanType || renewPlanType,
      panelExpiryBefore: panelExpiryBefore ? new Date(panelExpiryBefore).toISOString() : null,
      panelExpiryAfter: panelExpiryAfter ? new Date(panelExpiryAfter).toISOString() : null,
      panelMonthlyPrice: panelMonthly || null,
      isSpecChange: calcWithCoupon?.isSpecChange === true,
    };
  }

  if (Order && order._id) {
    await Order.findByIdAndUpdate(order._id, {
      resellerVmId: vmId,
      provider: 'reseller-api',
    });
  }

  return {
    success: true,
    vmId,
    upstream: renewRes,
    newExpiryDate,
    couponUsed,
    panelPlanType: panelPlanType || renewPlanType,
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

  const locationCtx = buildResellerLocationContext(ipStock, order);
  const purchaseStartedAt = order.createdAt
    ? new Date(order.createdAt).getTime()
    : Date.now() - 600_000;

  let provisioned = null;
  let ipLooksWrong =
    order.ipAddress &&
    locationCtx.expectedIpPrefix &&
    !ipMatchesOrderedRange(order.ipAddress, locationCtx.expectedIpPrefix);

  if (ipLooksWrong) {
    console.warn(
      `[RESELLER-SYNC] Order ${order._id} has IP ${order.ipAddress} but product expects ${locationCtx.expectedIpPrefix}.* — re-resolving`
    );
  }

  if (order.resellerVmId && !ipLooksWrong) {
    try {
      const linkedRow = await resolveOverviewRowForVm(api, order.resellerVmId);
      if (linkedRow && isMigrationOverviewRow(linkedRow)) {
        console.warn(
          `[RESELLER-SYNC] Order ${order._id} linked to migration VM ${order.resellerVmId} — re-resolving`
        );
        ipLooksWrong = true;
      } else if (
        order.resellerGroupId &&
        linkedRow &&
        !overviewRowMatchesBulkGroup(linkedRow, order.resellerGroupId)
      ) {
        console.warn(
          `[RESELLER-SYNC] Order ${order._id} VM ${order.resellerVmId} does not match bulk group ${order.resellerGroupId} — re-resolving`
        );
        ipLooksWrong = true;
      }
    } catch (_) { /* fall through */ }
  }

  if (order.resellerVmId && !ipLooksWrong) {
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

  if (
    !provisioned?.ip ||
    !provisioned?.password ||
    ipLooksWrong ||
    !(await provisionedMatchesOrderLocationAsync(api, provisioned, locationCtx))
  ) {
    provisioned = await waitForProvisionedVm(api, {
      resellerOrderId: order.resellerOrderId || null,
      resellerGroupId: order.resellerGroupId || null,
      resellerVmId: ipLooksWrong ? null : (order.resellerVmId || null),
      purchaseStartedAt,
      excludeOrderId: order._id,
      order,
      expectedZoneId: locationCtx.expectedZoneId,
      expectedIpPrefix: locationCtx.expectedIpPrefix,
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

  if (!(await provisionedMatchesOrderLocationAsync(api, provisioned, locationCtx))) {
    return {
      success: false,
      pending: true,
      error: `Panel VM IP ${provisioned.ip || '(none)'} does not match ordered region ${locationCtx.expectedIpPrefix || locationCtx.expectedZoneId}`,
    };
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

  // OceanLinux member-panel login (OL-xxxx) — generate if payment path skipped it
  let panelCredsUpdate = {};
  if (!order.panelUsername) {
    const { generatePanelCredentials } = await import('@/lib/panelCredentials');
    const { panelUsername, panelPassword } = generatePanelCredentials();
    panelCredsUpdate = { panelUsername, panelPassword };
  }

  await Order.findByIdAndUpdate(order._id, {
    status: fullyProvisioned ? 'active' : 'confirmed',
    provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
    provisioningError: fullyProvisioned ? '' : 'PENDING: awaiting IP/password from panel',
    provider: 'reseller-api',
    ...panelCredsUpdate,
    resellerVmId: provisioned.vmId || order.resellerVmId || undefined,
    resellerZoneId: locationCtx.expectedZoneId != null ? String(locationCtx.expectedZoneId) : undefined,
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

  const hasPanelRef =
    (order.resellerOrderId && String(order.resellerOrderId).trim()) ||
    (order.resellerVmId && String(order.resellerVmId).trim());
  if (!hasPanelRef && order.provider !== 'reseller-api') return order;

  const IPStock = require('@/models/ipStockModel');
  const ipStock = order.ipStockId ? await IPStock.findById(order.ipStockId) : null;
  if (!ipStock) return order;

  const locationCtx = buildResellerLocationContext(ipStock, order);
  const ipLooksWrong =
    ip &&
    locationCtx.expectedIpPrefix &&
    !ipMatchesOrderedRange(ip, locationCtx.expectedIpPrefix);

  if (ip && pwd && !ipLooksWrong) return order;

  const lastAttempt = order.lastProvisionAttempt
    ? new Date(order.lastProvisionAttempt).getTime()
    : 0;
  if (Date.now() - lastAttempt < RESELLER_FETCH_SYNC_COOLDOWN_MS) return order;

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
  extractExpectedIpPrefix,
  resolveExpectedZoneId,
  buildResellerLocationContext,
  ipMatchesOrderedRange,
  isMigrationOverviewRow,
  validateCreatedVmId,
  waitForProvisionedVm,
  syncResellerVmCredentials,
  renewResellerPanelVm,
  completeResellerPendingOrder,
  syncStuckResellerPendingOrders,
  maybeSyncResellerOrderOnFetch,
};
