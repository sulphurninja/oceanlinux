const HostdzireApi = require('@/services/hostdzireApi');
const { resolveHostdzireApiForOrder, getOrderIp } = require('@/lib/companyHostdzireApi');
const { looksLikeIpv4 } = require('@/lib/companyInventory');

function parseHostdzireExpiryDate(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickHostdzireExpiryDate(...candidates) {
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const nested = pickHostdzireExpiryDate(
        raw.nextduedate,
        raw.nextDueDate,
        raw.next_due_date,
        raw.duedate,
        raw.due_date,
        raw.expiryDate,
        raw.expiry,
        raw.expires_at,
        raw.expiresAt,
      );
      if (nested) return nested;
      continue;
    }
    const d = parseHostdzireExpiryDate(raw);
    if (d) return d;
  }
  return null;
}

function extractHostdzireExpiryFromDetails(detailsPayload) {
  const data = detailsPayload?.data || detailsPayload?.result || detailsPayload;
  return pickHostdzireExpiryDate(data);
}

async function fetchHostdzireExpiry(api, ip, hostdzireOrderId) {
  try {
    const detailsRes = await api.getDetails(ip);
    const fromDetails = extractHostdzireExpiryFromDetails(detailsRes);
    if (fromDetails) return fromDetails;
  } catch (err) {
    console.warn('[HOSTDZIRE-RENEW] getDetails expiry fetch failed:', err.message);
  }

  if (hostdzireOrderId) {
    try {
      const ordersRes = await api.getOrders();
      const orders = Array.isArray(ordersRes?.orders) ? ordersRes.orders : [];
      const match = orders.find((o) => String(o.id) === String(hostdzireOrderId));
      const fromOrder = pickHostdzireExpiryDate(match);
      if (fromOrder) return fromOrder;
    } catch (err) {
      console.warn('[HOSTDZIRE-RENEW] getOrders expiry fetch failed:', err.message);
    }
  }

  return null;
}

/**
 * Pay HostDzire invoice for the order IP (pay_invoice_by_ip) and fetch updated expiry.
 */
async function executeHostdzireUpstreamRenewal(order) {
  const ip = String(getOrderIp(order) || '').split(':')[0].trim();
  if (!looksLikeIpv4(ip)) {
    return {
      success: false,
      error: 'HostDzire renewal requires a valid IP on the order',
      ipAddress: ip || null,
    };
  }

  const { config, companyName } = await resolveHostdzireApiForOrder(order);
  if (!config) {
    return {
      success: false,
      error: 'HostDzire API is not configured for this order',
      ipAddress: ip,
    };
  }

  console.log('[HOSTDZIRE-RENEW] pay_invoice_by_ip', { ip, company: companyName || 'unknown' });

  try {
    const api = new HostdzireApi(config);
    const payRes = await api.payInvoiceByIp(ip);

    if (payRes?.status === 'error') {
      return {
        success: false,
        error: payRes.message || 'HostDzire pay_invoice_by_ip failed',
        result: payRes,
        ipAddress: ip,
      };
    }

    const newExpiryDate = await fetchHostdzireExpiry(api, ip, order?.hostdzireOrderId);

    return {
      success: true,
      result: payRes,
      newExpiryDate,
      ipAddress: ip,
      companyName,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'HostDzire renewal failed',
      result: err.body || null,
      status: err.status,
      ipAddress: ip,
    };
  }
}

module.exports = {
  parseHostdzireExpiryDate,
  pickHostdzireExpiryDate,
  extractHostdzireExpiryFromDetails,
  fetchHostdzireExpiry,
  executeHostdzireUpstreamRenewal,
};
