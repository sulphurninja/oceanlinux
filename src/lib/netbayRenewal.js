const { pickNetbayExpiryDate, resolveNetbayApiForOrder } = require('@/lib/netbayOrderSync');

/**
 * Call Netbay POST /api/v1/services/:id/renew using the company's API credentials.
 * Returns { success, result, error, newExpiryDate, serviceId }
 */
async function executeNetbayUpstreamRenewal(order, { months = 1 } = {}) {
  const { api, error } = await resolveNetbayApiForOrder(order);
  if (!api) {
    return { success: false, error, result: null, serviceId: order?.netbayServiceId || null };
  }

  const serviceId = order.netbayServiceId;
  console.log('[NETBAY-RENEW] Calling POST /api/v1/services/:id/renew', {
    serviceId,
    months,
  });

  try {
    const result = await api.renewService(serviceId, { months });
    const data = result?.data || {};
    const newExpiryDate = pickNetbayExpiryDate(data);
    return {
      success: true,
      result,
      serviceId,
      newExpiryDate,
    };
  } catch (err) {
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
