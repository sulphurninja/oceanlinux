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
const { extractSmartVpsIpPrefix } = require('@/lib/smartvpsIpPrefix');
const { parseAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const {
  defaultOsForProduct,
  normalizePanelOsForOrder,
  normalizePanelUsernameForOrder,
} = require('@/lib/orderOs');
const { resolvePanelSyncExpiryDate } = require('@/lib/expiryHelper');
const {
  commitPanelSyncToOrder,
  finalizeIpAssignmentForOrder,
} = require('@/lib/orderIpOwnership');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** e.g. "🖥️ 103.129.xx Windows VPS" → "103.129", "🌊 103.148 - 8GB Vps" → "103.148" */
function extractExpectedIpPrefix(ipStock, order) {
  const texts = [
    order?.productName,
    ipStock?.name,
    ipStock?.defaultConfigurations?.resellerApi?.zoneName,
  ];
  for (const text of texts) {
    const prefix = extractSmartVpsIpPrefix(text);
    if (prefix) return prefix.replace(/\.x+$/i, '');
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

async function getVmDetailsWithRetry(api, vmId, { attempts = 3, delayMs = 1500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await api.getVmDetails(String(vmId));
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastErr;
}

/** Exact bulk/order ref match — safe to skip flaky zone API checks when IP prefix also matches. */
function purchaseRefStronglyMatches(row, { resellerGroupId, resellerOrderId } = {}) {
  return overviewRowMatchesPurchase(row, { resellerGroupId, resellerOrderId });
}

async function rowMatchesOrderLocation(api, row, ctx = {}, purchaseRefs = null) {
  const refs = purchaseRefs || ctx.purchaseRefs || {};
  const { expectedZoneId, expectedIpPrefix } = ctx;
  if (!expectedZoneId && !(Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length) && !expectedIpPrefix) {
    return true;
  }

  const rowIp = ResellerApi.extractOverviewRowIp(row);
  if (expectedIpPrefix && rowIp && !ipMatchesOrderedRange(rowIp, expectedIpPrefix)) {
    return false;
  }

  const strongRef = purchaseRefStronglyMatches(row, refs);
  if (strongRef && (!expectedIpPrefix || (rowIp && ipMatchesOrderedRange(rowIp, expectedIpPrefix)))) {
    return true;
  }

  if (expectedZoneId || (Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length)) {
    const vmId = extractOverviewVmId(row);
    if (!vmId) return false;
    try {
      const details = await getVmDetailsWithRetry(api, vmId, { attempts: 2, delayMs: 1000 });
      const zoneId = extractVmZoneId(details);
      if (zoneId != null && !zoneIdAllowed(zoneId, ctx)) return false;
    } catch {
      // Panel overview already matched purchase ref + IP range — don't fail closed on brief API lag.
      if (strongRef && rowIp && (!expectedIpPrefix || ipMatchesOrderedRange(rowIp, expectedIpPrefix))) {
        return true;
      }
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

async function provisionedMatchesOrderLocationAsync(api, provisioned, ctx = {}, purchaseRefs = null) {
  if (!provisionedMatchesOrderLocation(provisioned, ctx)) return false;

  if (provisioned?._trustPurchaseRef && provisioned.ip) {
    return true;
  }

  const refs = purchaseRefs || ctx.purchaseRefs || {};
  const strongRef = refs.resellerGroupId || refs.resellerOrderId;
  if (
    strongRef &&
    provisioned?.ip &&
    (!ctx.expectedIpPrefix || ipMatchesOrderedRange(provisioned.ip, ctx.expectedIpPrefix))
  ) {
    return true;
  }

  if ((!ctx.expectedZoneId && !(Array.isArray(ctx.expectedZoneIds) && ctx.expectedZoneIds.length)) || !provisioned?.vmId) {
    return true;
  }
  try {
    const details = await getVmDetailsWithRetry(api, provisioned.vmId, { attempts: 2, delayMs: 1000 });
    const zoneId = extractVmZoneId(details);
    if (zoneId != null && !zoneIdAllowed(zoneId, ctx)) return false;
  } catch {
    if (
      provisioned?.ip &&
      (!ctx.expectedIpPrefix || ipMatchesOrderedRange(provisioned.ip, ctx.expectedIpPrefix))
    ) {
      return true;
    }
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
    details = await getVmDetailsWithRetry(api, vmId, { attempts: 3, delayMs: 1200 });
  } catch (_) { /* details may lag right after purchase */ }

  const ip = ips[0] || details?.ipAddress || details?.ip || null;
  const password = ResellerApi.extractVmPassword(details);
  const rawUsername = ResellerApi.extractVmUsername(details);
  const rawOs = ResellerApi.extractVmOs(details);
  const productName = order?.productName || '';
  const os = normalizePanelOsForOrder(rawOs, productName, order?.os);
  const username = normalizePanelUsernameForOrder(rawUsername, productName, order?.username, rawOs || os);
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
 * Fast path: scan overview for an exact purchase ref (groupId / orderId).
 * Avoids zone API checks that fail briefly while the panel VM is still warming up.
 */
async function findProvisionedVmByPurchaseRef(
  api,
  purchaseRefs,
  { order = null, locationCtx = {}, maxPages = 3 } = {}
) {
  const { resellerGroupId, resellerOrderId, resellerVmId } = purchaseRefs || {};
  if (!resellerGroupId && !resellerOrderId && !resellerVmId) return null;

  for (let page = 0; page < maxPages; page++) {
    const data = await api.getOrderOverviewPage(page, 50);
    const rows = data?.orders || data?.content || data?.items || [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    const totalPages = Number(data?.totalPages || data?.totalPage || 1) || 1;

    for (const row of rows) {
      if (!overviewRowMatchesPurchase(row, { resellerGroupId, resellerOrderId, resellerVmId })) {
        continue;
      }
      const rowIp = ResellerApi.extractOverviewRowIp(row);
      if (
        locationCtx.expectedIpPrefix &&
        rowIp &&
        !ipMatchesOrderedRange(rowIp, locationCtx.expectedIpPrefix)
      ) {
        continue;
      }
      const hydrated = await hydrateProvisionedRow(api, row, order);
      if (hydrated) {
        hydrated._trustPurchaseRef = true;
        return hydrated;
      }
    }

    if (page + 1 >= totalPages) break;
  }

  return null;
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
  const purchaseRefs = { resellerOrderId, resellerGroupId, resellerVmId };

  const immediate = await findProvisionedVmByPurchaseRef(api, purchaseRefs, {
    order,
    locationCtx,
  });
  if (immediate) return immediate;

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
          if (!(await rowMatchesOrderLocation(api, row, locationCtx, purchaseRefs))) continue;
          const hydrated = await hydrateProvisionedRow(api, row, order);
          if (hydrated) hydrated._trustPurchaseRef = true;
          if (hydrated && (await provisionedMatchesOrderLocationAsync(api, hydrated, locationCtx, purchaseRefs))) {
            return hydrated;
          }
        }

        if (resellerOrderId || resellerGroupId || purchaseStartedAt) {
          if (await isRecentPanelVm(api, row, purchaseAt)) {
            if (await rowMatchesOrderLocation(api, row, locationCtx, purchaseRefs)) {
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
        if (hydrated && (await provisionedMatchesOrderLocationAsync(api, hydrated, locationCtx, purchaseRefs))) {
          return hydrated;
        }
      }
    }

    const byRef = await findProvisionedVmByPurchaseRef(api, purchaseRefs, { order, locationCtx });
    if (byRef) return byRef;

    await sleep(pollMs);
  }

  return { pending: true, lastOverview };
}

function cleanOrderIp(ip) {
  return String(ip || '').split(':')[0].trim();
}

/**
 * Resolve reseller-panel VM for an order.
 * Order IP wins (admin manual IP change) — lookup by IP before stale resellerVmId.
 */
async function resolveResellerVmForOrder(resellerApi, order) {
  const wantedIp = cleanOrderIp(order.ipAddress);

  if (wantedIp) {
    const foundByIp = await resellerApi.findVmByIp(wantedIp);
    if (foundByIp) return foundByIp;
  }

  if (order.resellerVmId) {
    const overviewRow = await resolveOverviewRowForVm(resellerApi, order.resellerVmId).catch(() => null);
    const panelIp = overviewRow ? ResellerApi.extractOverviewRowIp(overviewRow) : null;
    return {
      vmId: String(order.resellerVmId),
      ip: panelIp || wantedIp || '',
      raw: overviewRow,
    };
  }

  const err = new Error(
    wantedIp
      ? `No VM visible for IP ${wantedIp} on the company's reseller panel.`
      : 'No IP address or VM id on order yet.'
  );
  err.status = 404;
  throw err;
}

async function syncResellerVmCredentials(api, order, vmId) {
  let effectiveVmId = vmId ? String(vmId) : null;
  let resolved = null;
  try {
    resolved = await resolveResellerVmForOrder(api, order);
    if (resolved?.vmId) effectiveVmId = String(resolved.vmId);
  } catch {
    // fall back to caller vmId when order has no resolvable IP yet
  }
  if (!effectiveVmId) {
    throw new Error('No reseller VM id available for credential sync');
  }

  const details = await api.getVmDetails(effectiveVmId);
  const resolvedRaw = resolved?.raw || null;
  const resolvedMatchesVm =
    resolvedRaw && String(extractOverviewVmId(resolvedRaw)) === String(effectiveVmId);
  const overviewRow =
    (resolvedMatchesVm ? resolvedRaw : null) ||
    (await resolveOverviewRowForVm(api, effectiveVmId, { maxPages: 100 }));
  const password = ResellerApi.extractVmPassword(details);
  const rawUsername = ResellerApi.extractVmUsername(details);
  const rawOs = ResellerApi.extractVmOs(details);
  const os = normalizePanelOsForOrder(rawOs, order.productName, order.os);
  const username = normalizePanelUsernameForOrder(rawUsername, order.productName, order.username, rawOs || os);
  const panelIp =
    ResellerApi.extractOverviewRowIp(overviewRow) ||
    ResellerApi.extractOverviewRowIp(resolvedRaw) ||
    details?.ipAddress ||
    details?.ip ||
    null;
  const orderIp = cleanOrderIp(order.ipAddress);
  const resolvedIp = cleanOrderIp(resolved?.ip);
  // Admin/customer order IP wins when it maps to a live VM on the panel.
  const ip = orderIp || resolvedIp || cleanOrderIp(panelIp) || null;
  const panelExpiry = ResellerApi.extractVmExpiryDate(overviewRow, resolvedRaw, details);
  const expiryDate = resolvePanelSyncExpiryDate(order, panelExpiry, { panelIsAuthoritative: true });

  const updates = { lastSyncTime: new Date(), resellerVmId: effectiveVmId };
  const changes = [];

  if (password && password !== order.password) {
    updates.password = password;
    changes.push('password');
  }
  if (username && username !== order.username) {
    updates.username = username;
    changes.push('username');
  }
  if (ip && cleanOrderIp(ip) !== orderIp) {
    updates.ipAddress = ip;
    changes.push('ipAddress');
  }
  if (expiryDate) {
    updates.expiryDate = expiryDate;
    changes.push('expiryDate');
  }
  if (os && os !== order.os) {
    updates.os = os;
    changes.push('os');
  }

  return { updates, changes, details, vmId: effectiveVmId };
}

function isCouponRenewFailure(err) {
  const msg = String(err?.message || err?.body?.error || err?.body?.message || '').toLowerCase();
  return /coupon|minimum order amount|promo/i.test(msg);
}

/** Hostheaven rejects coupon when discounted total is below ₹1000 — retry at full panel price. */
function isCouponMinimumOrderFailure(err) {
  const msg = String(err?.message || err?.body?.error || err?.body?.message || '').toLowerCase();
  return /minimum order amount/i.test(msg);
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

    // calculate-renewal can show coupon applied but upgrade-renew rejects when the
    // discounted total is below Hostheaven's minimum (e.g. UME299 on ~₹1173 VM → ₹874).
    // Fall back to full panel price so the renew still completes upstream.
    const allowFallback =
      isCouponMinimumOrderFailure(err) ||
      !(calcWithCoupon && couponAppliedOnCalculate(calcWithCoupon));

    if (!allowFallback) throw err;

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

    const couponMissing = upstreamCoupon && !couponAppliedOnCalculate(calcWithCoupon);
    const needsUpgradeRequote = calcWithCoupon?.isSpecChange === true || couponMissing;

    if (needsUpgradeRequote && vmId) {
      console.warn(
        `[RESELLER-RENEW] Re-quote VM ${vmId} via /api/pricing/upgrades (isSpecChange=${!!calcWithCoupon?.isSpecChange}, couponApplied=${couponAppliedOnCalculate(calcWithCoupon)})`
      );
      const fromUpgrade = await resolveRenewPriceIdsFromUpgradeOptions(api, vmId);
      if (fromUpgrade?.cpuPriceId) {
        priceIds = fromUpgrade;
        Object.assign(
          renewBody,
          buildRenewBody(vmId, order, stockCfg, priceIds, { couponCode: upstreamCoupon })
        );
        renewBody.planType = priceIds.planType || renewBody.planType;
        calcWithCoupon = await api.calculateRenewal(renewBody);
      }
    }

    if (upstreamCoupon && !couponAppliedOnCalculate(calcWithCoupon)) {
      return {
        success: false,
        error: `Hostheaven coupon ${upstreamCoupon} did not apply (panel quoted ₹${Number(calcWithCoupon?.payableAmount || 0).toFixed(0)}) — renew aborted to avoid full-price wallet debit.`,
        vmId,
        upstreamCoupon,
        couponUsed: null,
        calcQuote: {
          payableAmount: calcWithCoupon?.payableAmount,
          extensionCost: calcWithCoupon?.extensionCost,
          couponStatus: calcWithCoupon?.couponStatus,
          isSpecChange: calcWithCoupon?.isSpecChange,
        },
      };
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
    if (upstreamCoupon) {
      return {
        success: false,
        error: `Hostheaven renew quote failed with coupon ${upstreamCoupon}: ${calcErr.message}`,
        vmId,
        upstreamCoupon,
        couponUsed: null,
      };
    }
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

  let newExpiryDate = null;
  try {
    const freshOverview = await resolveOverviewRowForVm(api, vmId, { maxPages: 5 });
    newExpiryDate = ResellerApi.extractVmExpiryDate(freshOverview?.raw, freshOverview);
    if (!newExpiryDate) {
      const details = await api.getVmDetails(vmId);
      newExpiryDate = ResellerApi.extractVmExpiryDate(details);
    }
  } catch (_) { /* best effort */ }

  if (!newExpiryDate) {
    const { parseHostheavenExpiryDate } = require('@/lib/expiryHelper');
    newExpiryDate =
      parseHostheavenExpiryDate(renewRes?.newExpiry || renewRes?.expiresAt) ||
      ResellerApi.extractVmExpiryDate(overviewRow?.raw, overviewRow);
  }

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
    panelPayableAmount: calcWithCoupon?.payableAmount ?? null,
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
  const purchaseRefs = {
    resellerOrderId: order.resellerOrderId || null,
    resellerGroupId: order.resellerGroupId || null,
    resellerVmId: order.resellerVmId || null,
  };

  let provisioned = null;

  if (purchaseRefs.resellerGroupId || purchaseRefs.resellerOrderId || purchaseRefs.resellerVmId) {
    provisioned = await findProvisionedVmByPurchaseRef(api, purchaseRefs, { order, locationCtx });
  }
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
      const resolved = await resolveResellerVmForOrder(api, order);
      const synced = await syncResellerVmCredentials(api, order, resolved.vmId);
      if (synced.updates.ipAddress || synced.updates.password) {
        provisioned = {
          vmId: String(synced.vmId || resolved.vmId),
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
    const orderIp = cleanOrderIp(order.ipAddress);
    if (orderIp && order.password) {
      try {
        const foundByOrderIp = await api.findVmByIp(orderIp);
        if (foundByOrderIp?.vmId) {
          const synced = await syncResellerVmCredentials(api, order, foundByOrderIp.vmId);
          provisioned = {
            vmId: String(synced.vmId || foundByOrderIp.vmId),
            ip: orderIp,
            password: synced.updates.password || order.password,
            username: synced.updates.username || order.username,
            os: synced.updates.os || order.os,
            expiryDate: synced.updates.expiryDate || order.expiryDate,
          };
        }
      } catch (_) {
        // fall through to overview poll
      }
    }

    if (
      !provisioned?.ip ||
      !provisioned?.password ||
      (ipLooksWrong && !cleanOrderIp(order.ipAddress)) ||
      (!(provisioned?.ip && cleanOrderIp(order.ipAddress) === cleanOrderIp(provisioned.ip)) &&
        !(await provisionedMatchesOrderLocationAsync(api, provisioned, locationCtx)))
    ) {
      provisioned = await waitForProvisionedVm(api, {
        resellerOrderId: order.resellerOrderId || null,
        resellerGroupId: order.resellerGroupId || null,
        resellerVmId: ipLooksWrong ? null : (order.resellerVmId || null),
        purchaseStartedAt,
        excludeOrderId: order._id,
        order,
        expectedZoneId: locationCtx.expectedZoneId,
        expectedZoneIds: locationCtx.expectedZoneIds,
        expectedIpPrefix: ipLooksWrong ? null : locationCtx.expectedIpPrefix,
        maxWaitMs: 120_000,
        pollMs: 3000,
      });
    }
  }

  if (provisioned?.pending) {
    return { success: false, pending: true, error: 'Panel VM still pending IP/credentials' };
  }

  if (!provisioned?.vmId && !provisioned?.ip && !provisioned?.password) {
    return { success: false, error: 'No VM found on panel for this order' };
  }

  if (
    !provisioned._trustPurchaseRef &&
    !(await provisionedMatchesOrderLocationAsync(api, provisioned, locationCtx, purchaseRefs))
  ) {
    return {
      success: false,
      pending: true,
      error: `Panel VM IP ${provisioned.ip || '(none)'} does not match ordered region ${locationCtx.expectedIpPrefix || locationCtx.expectedZoneId}`,
    };
  }

  const os = normalizePanelOsForOrder(provisioned.os, order.productName, order.os);
  const username = normalizePanelUsernameForOrder(
    provisioned.username,
    order.productName,
    order.username,
    provisioned.os || os
  );
  const orderIpLocked = cleanOrderIp(order.ipAddress);
  const ipAddress =
    orderIpLocked && order.password
      ? orderIpLocked
      : (provisioned.ip || order.ipAddress || '');
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

  const provisionUpdate = {
    status: fullyProvisioned ? 'active' : 'confirmed',
    provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
    provisioningError: fullyProvisioned ? '' : 'PENDING: awaiting IP/password from panel',
    provider: 'reseller-api',
    ...panelCredsUpdate,
    resellerVmId: provisioned.vmId || order.resellerVmId || undefined,
    resellerZoneId: locationCtx.expectedZoneId != null ? String(locationCtx.expectedZoneId) : undefined,
    username,
    password,
    os,
    expiryDate,
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
  };

  if (fullyProvisioned && ipAddress) {
    await finalizeIpAssignmentForOrder(order, ipAddress, provisionUpdate);
  } else {
    await Order.findByIdAndUpdate(order._id, { ...provisionUpdate, ipAddress });
  }

  return {
    success: fullyProvisioned,
    ipAddress,
    vmId: provisioned.vmId || order.resellerVmId,
    pending: !fullyProvisioned,
  };
}

async function syncStuckResellerPendingOrders({ limit = 25 } = {}) {
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
          { resellerGroupId: { $exists: true, $nin: [null, ''] } },
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

const RESELLER_FETCH_SYNC_COOLDOWN_MS = 5000;
const pendingCompletionTimers = new Map();

/**
 * After a HOTSTART/PrimeVPS purchase, the panel VM can take 5–30s to expose IP/password.
 * Schedule background completion retries so orders don't stay stuck until the next cron.
 */
function scheduleResellerPendingCompletion(orderId, { delaysMs = [3000, 8000, 20000, 45000, 90000] } = {}) {
  const key = String(orderId);
  if (pendingCompletionTimers.has(key)) return;

  const runAttempt = async (index) => {
    try {
      const Order = (await import('@/models/orderModel')).default;
      const IPStock = require('@/models/ipStockModel');
      const order = await Order.findById(orderId);
      if (!order) {
        pendingCompletionTimers.delete(key);
        return;
      }
      if (order.provisioningStatus === 'active' && order.ipAddress) {
        pendingCompletionTimers.delete(key);
        return;
      }
      const ipStock = order.ipStockId ? await IPStock.findById(order.ipStockId) : null;
      if (!ipStock) return;

      const out = await completeResellerPendingOrder(order, ipStock);
      if (out.success && out.ipAddress) {
        console.log(`[RESELLER-SYNC] Background completion OK for order ${orderId} → ${out.ipAddress}`);
        pendingCompletionTimers.delete(key);
        return;
      }
    } catch (err) {
      console.warn(`[RESELLER-SYNC] Background completion attempt ${index} for ${orderId}:`, err.message);
    }

    if (index + 1 >= delaysMs.length) {
      pendingCompletionTimers.delete(key);
      return;
    }

    const timer = setTimeout(() => runAttempt(index + 1), delaysMs[index + 1] - delaysMs[index]);
    pendingCompletionTimers.set(key, timer);
  };

  const timer = setTimeout(() => runAttempt(0), delaysMs[0]);
  pendingCompletionTimers.set(key, timer);
}

/**
 * When customer opens manage order, pull IP/credentials from panel.
 * Always syncs os/username/password when a panel ref exists — a reinstall
 * can change the OS even though IP+password were already stored.
 */
async function maybeSyncResellerOrderOnFetch(order) {
  if (!order) return order;
  const { isExpiredServiceForCustomer } = require('@/lib/expiredPanelSync');
  if (isExpiredServiceForCustomer(order)) return order;
  const ip = (order.ipAddress || '').trim();
  const pwd = (order.password || '').trim();

  const hasPanelRef =
    (order.resellerOrderId && String(order.resellerOrderId).trim()) ||
    (order.resellerGroupId && String(order.resellerGroupId).trim()) ||
    (order.resellerVmId && String(order.resellerVmId).trim());
  if (!hasPanelRef && order.provider !== 'reseller-api') return order;

  const IPStock = require('@/models/ipStockModel');
  const ipStock = order.ipStockId ? await IPStock.findById(order.ipStockId) : null;
  if (!ipStock) return order;

  const lastSync = order.lastSyncTime ? new Date(order.lastSyncTime).getTime() : 0;
  if (Date.now() - lastSync < RESELLER_FETCH_SYNC_COOLDOWN_MS) return order;

  if (ip && pwd) {
    try {
      const Company = (await import('@/models/companyModel')).default;
      const Order = (await import('@/models/orderModel')).default;
      const company = await Company.findById(ipStock.company).select('resellerApi name').lean();
      const cfg = getCompanyResellerApiConfig(company);
      if (!cfg) return order;

      const api = new ResellerApi(cfg);
      const resolved = await resolveResellerVmForOrder(api, order);
      const synced = await syncResellerVmCredentials(api, order, resolved.vmId);
      if (synced.changes.length) {
        await commitPanelSyncToOrder(order, synced.updates);
      }
      return await Order.findById(order._id).lean();
    } catch (err) {
      console.warn('[RESELLER-SYNC] Credential sync on fetch failed:', err.message);
      return order;
    }
  }

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
  findProvisionedVmByPurchaseRef,
  waitForProvisionedVm,
  syncResellerVmCredentials,
  resolveResellerVmForOrder,
  renewResellerPanelVm,
  completeResellerPendingOrder,
  syncStuckResellerPendingOrders,
  scheduleResellerPendingCompletion,
  maybeSyncResellerOrderOnFetch,
};
