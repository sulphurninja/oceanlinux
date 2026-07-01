const IPStock = require('@/models/ipStockModel');
const Company = require('@/models/companyModel').default;
const Order = require('@/models/orderModel');
const NetbayApi = require('@/services/netbayApi');
const { getCompanyNetbayApiConfig } = require('@/lib/companyNetbayApi');

function pickNetbayExpiryDate(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const raw =
    payload.newExpiryDate ||
    payload.expiresAt ||
    payload.expiryDate ||
    payload.expiry;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function resolveNetbayApiForOrder(order) {
  if (!order?.netbayServiceId) {
    return { api: null, config: null, error: 'No Netbay service ID on order' };
  }

  if (!order?.ipStockId) {
    return { api: null, config: null, error: 'Order has no linked IP stock for Netbay config' };
  }

  const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
  if (!ipStock?.company) {
    return { api: null, config: null, error: 'Netbay company not linked to this plan' };
  }

  const company = await Company.findById(ipStock.company).select('netbayApi name').lean();
  const config = getCompanyNetbayApiConfig(company);
  if (!config) {
    return { api: null, config: null, error: 'Netbay API is not configured for this company' };
  }

  return { api: new NetbayApi(config), config, companyName: company?.name || '' };
}

/**
 * Map Netbay GET /services/:id status to OceanLinux powerState.
 * Netbay uses "Active" when the VM is running and "Stopped" when powered off.
 * If API says Stopped but SSH/RDP responds, prefer running (API lag / panel mismatch).
 */
function resolveNetbayPowerState(svc, { ipAddress, checkReachable } = {}) {
  const raw = String(
    svc?.powerState ||
    svc?.powerStatus ||
    svc?.vmStatus ||
    svc?.status ||
    svc?.state ||
    ''
  ).trim();
  const sl = raw.toLowerCase();

  const runningHints = ['running', 'on', 'active', 'started', 'online', 'up'];
  const stoppedHints = ['stopped', 'off', 'shutdown', 'offline', 'down', 'inactive'];

  const ip = (ipAddress || NetbayApi.extractServiceIp(svc) || '').trim();

  if (runningHints.includes(sl)) {
    return { powerState: 'running', rawStatus: raw };
  }

  if (stoppedHints.includes(sl)) {
    if (ip && typeof checkReachable === 'function' && checkReachable(ip)) {
      return { powerState: 'running', rawStatus: raw, reachabilityOverride: true };
    }
    return { powerState: 'stopped', rawStatus: raw };
  }

  if (['suspended', 'paused'].includes(sl)) {
    return { powerState: 'suspended', rawStatus: raw };
  }

  if (ip && typeof checkReachable === 'function') {
    const reachable = checkReachable(ip);
    return {
      powerState: reachable ? 'running' : 'stopped',
      rawStatus: raw || 'unknown',
      fromReachability: true,
    };
  }

  return { powerState: 'unknown', rawStatus: raw || null };
}

/**
 * Build MongoDB $set fields from a Netbay GET /services/:id payload.
 * Always prefers Netbay expiryDate when present.
 */
function applyNetbayServiceToOrderUpdates(svc, order) {
  const dbUpdates = { lastSyncTime: new Date() };
  const changes = [];

  if (!svc) {
    return { dbUpdates, changes, expiryDate: null };
  }

  const freshIp = NetbayApi.extractServiceIp(svc);
  if (freshIp) {
    if (freshIp !== order?.ipAddress) changes.push('ipAddress');
    dbUpdates.ipAddress = freshIp;
  }

  if (svc.username) {
    if (svc.username !== order?.username) changes.push('username');
    dbUpdates.username = svc.username;
  }

  if (svc.password) {
    if (svc.password !== order?.password) changes.push('password');
    dbUpdates.password = svc.password;
  }

  const expiryDate = pickNetbayExpiryDate(svc);
  if (expiryDate) {
    const prevMs = order?.expiryDate ? new Date(order.expiryDate).getTime() : null;
    const nextMs = expiryDate.getTime();
    if (prevMs !== nextMs) {
      dbUpdates.expiryDate = expiryDate;
      changes.push('expiryDate');
    } else if (!order?.expiryDate) {
      dbUpdates.expiryDate = expiryDate;
      changes.push('expiryDate');
    }
  }

  return { dbUpdates, changes, expiryDate };
}

/** Fetch GET /services/:id and return order updates (does not write DB). */
async function syncNetbayOrderFromApi(order) {
  const { api, error } = await resolveNetbayApiForOrder(order);
  if (!api) {
    return { ok: false, error, dbUpdates: {}, changes: [], service: null };
  }

  const detailRes = await api.getService(order.netbayServiceId);
  const svc = NetbayApi.unwrapServiceResponse(detailRes);
  const { dbUpdates, changes, expiryDate } = applyNetbayServiceToOrderUpdates(svc, order);

  return { ok: true, dbUpdates, changes, expiryDate, service: svc };
}

/** Sync all active Netbay orders — expiry + credentials from upstream. */
async function syncAllNetbayOrdersFromApi() {
  const orders = await Order.find({
    netbayServiceId: { $exists: true, $nin: [null, ''] },
    status: { $in: ['active', 'confirmed'] },
  })
    .select('_id netbayServiceId ipStockId expiryDate ipAddress username password')
    .lean();

  let updated = 0;
  let expirySynced = 0;
  const errors = [];

  for (const order of orders) {
    try {
      const sync = await syncNetbayOrderFromApi(order);
      if (!sync.ok) {
        errors.push({ orderId: String(order._id), error: sync.error });
        continue;
      }

      const hasFieldUpdates = sync.changes.length > 0;
      if (hasFieldUpdates) {
        await Order.findByIdAndUpdate(order._id, { $set: sync.dbUpdates });
        updated += 1;
        if (sync.changes.includes('expiryDate')) expirySynced += 1;
      } else {
        await Order.findByIdAndUpdate(order._id, { $set: { lastSyncTime: sync.dbUpdates.lastSyncTime } });
      }
    } catch (err) {
      errors.push({ orderId: String(order._id), error: err.message });
    }
  }

  return {
    total: orders.length,
    updated,
    expirySynced,
    errors,
  };
}

module.exports = {
  pickNetbayExpiryDate,
  resolveNetbayApiForOrder,
  resolveNetbayPowerState,
  applyNetbayServiceToOrderUpdates,
  syncNetbayOrderFromApi,
  syncAllNetbayOrdersFromApi,
};
