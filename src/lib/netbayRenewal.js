const IPStock = require('@/models/ipStockModel');
const { pickNetbayExpiryDate, resolveNetbayApiForOrder } = require('@/lib/netbayOrderSync');
const {
  mergeNetbayStockCoupons,
  resolveNetbayCouponForMemory,
} = require('@/lib/companyNetbayApi');
const { resolveNetbayCouponProductKind } = require('@/lib/netbayGroupTags');

function isNetbayCouponError(err) {
  const text = `${err?.message || ''} ${JSON.stringify(err?.body || '')}`.toLowerCase();
  return text.includes('coupon') || text.includes('promo');
}

/** Same promo as purchase: code saved on the order, else the plan's configured coupon. */
async function couponForNetbayRenewal(order, config) {
  const saved = String(order?.netbayCouponCode || '').trim().toUpperCase();
  if (saved) return saved;
  if (!config || !order?.ipStockId) return '';

  const stock = await IPStock.findById(order.ipStockId)
    .select('serverType tags memoryOptions defaultConfigurations')
    .lean();
  const stockNetbayRaw = stock?.defaultConfigurations?.netbay || {};
  const merged = mergeNetbayStockCoupons(config, stockNetbayRaw);
  const productKind = resolveNetbayCouponProductKind(stock, order);
  return resolveNetbayCouponForMemory(merged, order.memory, productKind);
}

/**
 * Call Netbay POST /api/v1/services/:id/renew using the company's API credentials.
 * Returns { success, result, error, newExpiryDate, serviceId }
 */
async function executeNetbayUpstreamRenewal(order, { months = 1 } = {}) {
  const { api, config, error } = await resolveNetbayApiForOrder(order);
  if (!api) {
    return { success: false, error, result: null, serviceId: order?.netbayServiceId || null };
  }

  const serviceId = order.netbayServiceId;
  const isProxy = String(order?.netbayProductKind || '').toLowerCase() === 'proxy';
  const couponCode = await couponForNetbayRenewal(order, config);
  console.log('[NETBAY-RENEW] Calling Netbay renew', {
    serviceId,
    months,
    isProxy,
    couponCode: couponCode || '(none)',
  });

  const callRenew = (code) => (
    isProxy
      ? api.renewProxy(serviceId, { months, couponCode: code })
      : api.renewService(serviceId, { months, couponCode: code })
  );

  try {
    let result;
    let couponUsed = couponCode;
    let couponFallback = false;
    try {
      result = await callRenew(couponCode);
    } catch (err) {
      if (!couponCode || !isNetbayCouponError(err)) throw err;
      console.warn(`[NETBAY-RENEW] Coupon ${couponCode} rejected, retrying without promo:`, err.message);
      couponUsed = '';
      couponFallback = true;
      result = await callRenew('');
    }
    const data = result?.data || {};
    const newExpiryDate = pickNetbayExpiryDate(data);
    return {
      success: true,
      result,
      serviceId,
      newExpiryDate,
      couponCode: couponUsed,
      couponFallback,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      result: err.body || null,
      status: err.status,
      serviceId,
      couponCode,
    };
  }
}

module.exports = {
  pickNetbayExpiryDate,
  resolveNetbayApiForOrder,
  executeNetbayUpstreamRenewal,
};
