const connectDB = require('@/lib/db').default;
const Order = require('@/models/orderModel').default;
const IPStock = require('@/models/ipStockModel');
const Company = require('@/models/companyModel').default;
const NexaApi = require('@/services/nexaApi');
const { getCompanyNexaApiConfig } = require('@/lib/companyNexaApi');
const { finalizeIpAssignmentForOrder } = require('@/lib/orderIpOwnership');

const NEXA_PENDING_ERROR = 'PENDING: Nexa is still provisioning this IP.';
const MATCH_WINDOW_MS = 3 * 60 * 1000;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function parseNexaTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(`${text.replace(' ', 'T')}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isNexaDeferredPurchaseError(message) {
  return /unable to process order transaction/i.test(String(message || ''));
}

function isNexaHeldOrder(order) {
  if (!order) return false;
  if (order.nexaOrderId) return true;
  const err = String(order.provisioningError || '');
  return err.startsWith('PENDING:') || isNexaDeferredPurchaseError(err);
}

function isNexaDeadStatus(status) {
  return /^(failed|cancelled|canceled|refunded|rejected)$/i.test(String(status || '').trim());
}

function stockPlanId(stock) {
  const cfg = stock?.defaultConfigurations;
  const nexa = cfg?.nexa || (typeof cfg?.get === 'function' ? cfg.get('nexa') : null) || {};
  const id = Number(nexa.planId);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function displayIpFromDelivery(delivered) {
  const host = String(delivered?.ip || '').trim();
  const port = String(delivered?.port || '').trim();
  if (!host) return '';
  if (!port || host.includes(':')) return host;
  return `${host}:${port}`;
}

async function listCompanyNexaOrders(companyId) {
  const company = companyId
    ? await Company.findById(companyId).select('nexaApi').lean()
    : null;
  const companies = company
    ? [company]
    : await Company.find({ 'nexaApi.enabled': true }).select('nexaApi').lean();
  const rows = [];
  for (const row of companies) {
    const cfg = getCompanyNexaApiConfig(row);
    if (!cfg) continue;
    try {
      const data = await new NexaApi(cfg).listOrders();
      const list = Array.isArray(data?.orders) ? data.orders : [];
      rows.push(...list);
    } catch (err) {
      console.warn('[NEXA] order list failed:', err.message);
    }
  }
  return rows;
}

async function takenNexaOrderIds() {
  const linked = await Order.find({
    nexaOrderId: { $exists: true, $nin: [null, ''] },
  }).select('nexaOrderId').lean();
  return new Set(linked.map((row) => String(row.nexaOrderId)));
}

function findClaimRow(rows, order, stock, taken) {
  const planId = stockPlanId(stock);
  const created = new Date(order.createdAt).getTime();
  if (!planId || !created) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const row of rows) {
    const nexaId = String(NexaApi.extractOrderId(row) || '');
    if (!nexaId || taken.has(nexaId)) continue;
    if (Number(row.plan_id) !== planId) continue;
    const nexaTime = parseNexaTime(row.created_at);
    if (!nexaTime) continue;
    const delta = nexaTime.getTime() - created;
    if (delta < -30 * 1000 || delta > MATCH_WINDOW_MS) continue;
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }
  return best;
}

async function holdNexaOrder(order, extra = {}) {
  await Order.findByIdAndUpdate(order._id, {
    status: 'confirmed',
    provisioningStatus: 'provisioning',
    provisioningError: NEXA_PENDING_ERROR,
    provider: 'nexa',
    autoProvisioned: true,
    lastProvisionAttempt: new Date(),
    ...extra,
  });
  return { action: 'pending', nexaOrderId: extra.nexaOrderId || order.nexaOrderId || '' };
}

async function applyNexaRow(order, row) {
  const nexaOrderId = String(NexaApi.extractOrderId(row) || '');
  const status = String(row.status || '').trim();
  if (isNexaDeadStatus(status)) {
    await Order.findByIdAndUpdate(order._id, {
      provisioningStatus: 'failed',
      provisioningError: `Nexa order ${nexaOrderId} is ${status}.`,
      nexaOrderId: nexaOrderId || undefined,
      provider: 'nexa',
      autoProvisioned: true,
    });
    return { action: 'failed', nexaOrderId };
  }

  const delivered = NexaApi.extractPurchaseDelivery(row);
  const displayIp = displayIpFromDelivery(delivered);
  if (displayIp && nexaOrderId) {
    let expiryDate = null;
    const rawExpiry = delivered.expiry || row.expires_at;
    if (rawExpiry) {
      const parsed = new Date(rawExpiry);
      if (!Number.isNaN(parsed.getTime())) expiryDate = parsed;
    }
    if (!expiryDate) {
      const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
      expiryDate = calculateCompanyExpiryDate();
    }
    const updateData = {
      status: 'active',
      provisioningStatus: 'active',
      provisioningError: '',
      provider: 'nexa',
      nexaOrderId,
      username: delivered.username || order.username || undefined,
      password: delivered.password || order.password || '',
      ipAddress: displayIp,
      autoProvisioned: true,
      os: order.os || 'Ubuntu 22',
      expiryDate,
    };
    await finalizeIpAssignmentForOrder(order, displayIp, updateData);
    return { action: 'assigned', nexaOrderId };
  }

  return holdNexaOrder(order, { nexaOrderId: nexaOrderId || undefined });
}

async function resumeNexaOrder(order, ipStock, { holdIfMissing = true } = {}) {
  await connectDB();
  const rows = await listCompanyNexaOrders(ipStock?.company);
  const taken = await takenNexaOrderIds();
  if (order.nexaOrderId) taken.delete(String(order.nexaOrderId));

  let row = null;
  if (order.nexaOrderId) {
    row = rows.find((item) => String(NexaApi.extractOrderId(item)) === String(order.nexaOrderId)) || null;
  }
  if (!row) row = findClaimRow(rows, order, ipStock, taken);
  if (!row) {
    if (!holdIfMissing) return { action: 'none', nexaOrderId: '' };
    const held = await holdNexaOrder(order);
    return held;
  }
  return applyNexaRow(order, row);
}

async function syncNexaPendingOrders({ limit = 40 } = {}) {
  await connectDB();
  const since = new Date(Date.now() - LOOKBACK_MS);
  const candidates = await Order.find({
    status: 'confirmed',
    ipAddress: { $in: [null, ''] },
    provisioningStatus: { $nin: ['active'] },
    $or: [
      { nexaOrderId: { $exists: true, $nin: [null, ''] } },
      { provider: 'nexa', createdAt: { $gte: since } },
    ],
  }).sort({ createdAt: 1 }).limit(limit).lean();

  if (!candidates.length) return [];

  const stockIds = [...new Set(candidates.map((row) => String(row.ipStockId || '')).filter(Boolean))];
  const stocks = stockIds.length
    ? await IPStock.find({ _id: { $in: stockIds } }).select('defaultConfigurations company').lean()
    : [];
  const stockById = new Map(stocks.map((row) => [String(row._id), row]));
  const companyIds = [...new Set(stocks.map((row) => String(row.company || '')).filter(Boolean))];
  const rows = [];
  for (const companyId of companyIds) {
    rows.push(...await listCompanyNexaOrders(companyId));
  }
  rows.sort((a, b) => {
    const left = parseNexaTime(a.created_at)?.getTime() || 0;
    const right = parseNexaTime(b.created_at)?.getTime() || 0;
    return left - right;
  });

  const taken = await takenNexaOrderIds();
  const results = [];
  const claimedLocal = new Set();

  for (const order of candidates) {
    if (!order.nexaOrderId) continue;
    const row = rows.find((item) => String(NexaApi.extractOrderId(item)) === String(order.nexaOrderId));
    if (!row) {
      if (isNexaHeldOrder(order)) {
        const held = await holdNexaOrder(order);
        results.push({ orderId: String(order._id), ...held });
      }
      continue;
    }
    try {
      const applied = await applyNexaRow(order, row);
      claimedLocal.add(String(order._id));
      results.push({ orderId: String(order._id), ...applied });
    } catch (err) {
      results.push({ orderId: String(order._id), action: 'error' });
      console.warn('[NEXA] pending apply failed:', err.message);
    }
  }

  for (const row of rows) {
    const nexaId = String(NexaApi.extractOrderId(row) || '');
    if (!nexaId || taken.has(nexaId)) continue;
    let best = null;
    let bestDelta = Infinity;
    for (const order of candidates) {
      if (order.nexaOrderId || claimedLocal.has(String(order._id))) continue;
      const stock = stockById.get(String(order.ipStockId || ''));
      if (!stock || stockPlanId(stock) !== Number(row.plan_id)) continue;
      const nexaTime = parseNexaTime(row.created_at);
      const created = new Date(order.createdAt).getTime();
      if (!nexaTime || !created) continue;
      const delta = nexaTime.getTime() - created;
      if (delta < -30 * 1000 || delta > MATCH_WINDOW_MS) continue;
      if (delta < bestDelta) {
        best = order;
        bestDelta = delta;
      }
    }
    if (!best) continue;
    taken.add(nexaId);
    claimedLocal.add(String(best._id));
    try {
      const applied = await applyNexaRow(best, row);
      results.push({ orderId: String(best._id), ...applied });
    } catch (err) {
      results.push({ orderId: String(best._id), action: 'error' });
      console.warn('[NEXA] pending claim failed:', err.message);
    }
  }

  for (const order of candidates) {
    if (claimedLocal.has(String(order._id)) || order.nexaOrderId) continue;
    if (!isNexaDeferredPurchaseError(order.provisioningError) && !String(order.provisioningError || '').startsWith('PENDING:')) {
      continue;
    }
    const held = await holdNexaOrder(order);
    results.push({ orderId: String(order._id), ...held });
  }

  return results;
}

module.exports = {
  NEXA_PENDING_ERROR,
  isNexaDeferredPurchaseError,
  isNexaHeldOrder,
  resumeNexaOrder,
  syncNexaPendingOrders,
};
