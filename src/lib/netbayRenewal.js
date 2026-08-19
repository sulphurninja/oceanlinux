const { pickNetbayExpiryDate, resolveNetbayApiForOrder } = require('@/lib/netbayOrderSync');
const { resolveNetbayCouponForMemory } = require('@/lib/companyNetbayApi');
const { isNetbayProxyOrder } = require('@/lib/netbayProxy');

/**
 * Call Netbay VM or proxy renew using the company's API credentials.
 */
async function executeNetbayUpstreamRenewal(order, { months = 1 } = {}) {
  const { api, config, error } = await resolveNetbayApiForOrder(order);
  if (!api) {
    return {
      success: false,
      error,
      result: null,
      serviceId: order?.netbayProxyId || order?.netbayServiceId || null,
    };
  }

  const isProxy = isNetbayProxyOrder(order);
  const serviceId = isProxy ? order.netbayProxyId : order.netbayServiceId;
  const couponCode = resolveNetbayCouponForMemory(config, order?.memory) || undefined;
  console.log('[NETBAY-RENEW] Calling renew', {
    kind: isProxy ? 'proxy' : 'vm',
    serviceId,
    months,
    couponCode: couponCode || null,
  });

  const callRenew = (withCoupon) =>
    isProxy
      ? api.renewProxy(serviceId, { months, couponCode: withCoupon ? couponCode : undefined })
      : api.renewService(serviceId, { months, couponCode: withCoupon ? couponCode : undefined });

  try {
    const result = await callRenew(!!couponCode);
    const data = result?.data || {};
    return {
      success: true,
      result,
      serviceId,
      newExpiryDate: pickNetbayExpiryDate(data) || pickNetbayExpiryDate(data.proxy),
      couponUsed: couponCode || null,
    };
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    const couponRejected =
      couponCode && (/coupon|promo|unknown field|not allowed|invalid parameter/i.test(msg));
    if (couponRejected) {
      console.warn('[NETBAY-RENEW] Coupon rejected, retrying without coupon:', err.message);
      try {
        const result = await callRenew(false);
        const data = result?.data || {};
        return {
          success: true,
          result,
          serviceId,
          newExpiryDate: pickNetbayExpiryDate(data) || pickNetbayExpiryDate(data.proxy),
          couponUsed: null,
          couponFallback: true,
        };
      } catch (retryErr) {
        return {
          success: false,
          error: retryErr.message,
          result: retryErr.body || null,
          status: retryErr.status,
          serviceId,
        };
      }
    }
    return {
      success: false,
      error: err.message,
      result: err.body || null,
      status: err.status,
      serviceId,
    };
  }
}

module.exports = {
  pickNetbayExpiryDate,
  resolveNetbayApiForOrder,
  executeNetbayUpstreamRenewal,
};
