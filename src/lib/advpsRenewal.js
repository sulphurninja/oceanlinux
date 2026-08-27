const AdvpsAPI = require('@/services/advpsApi');
const { resolveAdvpsIdsForRenewal } = require('@/lib/advpsOrderSync');

function isAdvpsTestApiKey() {
  const key = String(process.env.ADVPS_API_KEY || '').trim();
  return key.startsWith('sk_test_');
}

function isAdvpsTestModeResponse(result) {
  if (!result || typeof result !== 'object') return false;
  const mode = String(result?.data?.mode || result?.mode || '').toUpperCase();
  const message = String(result?.message || result?.data?.message || '');
  return mode === 'TEST' || /test mode/i.test(message);
}

/** Throws if renewal did not hit production ADVPS. */
function validateAdvpsRenewalResult(result) {
  if (isAdvpsTestApiKey()) {
    throw new Error(
      'ADVPS_API_KEY is a test key (sk_test_). Real VMs are not renewed — replace with your production ADVPS API key on the server.'
    );
  }
  if (isAdvpsTestModeResponse(result)) {
    throw new Error(
      'ADVPS returned TEST mode — the VM was not actually renewed upstream. Use a production ADVPS API key.'
    );
  }
}

/**
 * Call ADVPS POST /api/v1/services/renew with resolved ids.
 * Returns { success, result, error, serviceId, advpsOrderId, testMode, correctedServiceId }
 */
async function executeAdvpsUpstreamRenewal(api, order, { Order } = {}) {
  const resolved = await resolveAdvpsIdsForRenewal(api, order, { Order });
  if (!resolved.serviceId) {
    return {
      success: false,
      error: resolved.error || 'No ADVPS service ID attached',
      result: null,
    };
  }

  const advpsOrderId = resolved.advpsOrderId;
  if (!advpsOrderId) {
    return {
      success: false,
      error: resolved.error || 'Missing ADVPS purchase order ID (advpsOrderId)',
      result: null,
      serviceId: resolved.serviceId,
    };
  }

  const serviceId = resolved.serviceId;

  console.log('[ADVPS-RENEW] Calling POST /api/v1/services/renew', {
    orderId: advpsOrderId,
    serviceIds: [serviceId],
  });

  try {
    const result = await api.renewServices({
      orderId: advpsOrderId,
      serviceIds: [serviceId],
      serviceValidities: [{ serviceId, validity: 30 }],
    });
    validateAdvpsRenewalResult(result);
    return {
      success: true,
      result,
      serviceId,
      advpsOrderId,
      correctedServiceId: resolved.corrected ? serviceId : undefined,
      previousServiceId: resolved.corrected ? resolved.previousServiceId : undefined,
    };
  } catch (err) {
    const testMode = isAdvpsTestApiKey() || isAdvpsTestModeResponse(err.advpsBody);
    const msg = String(err.message || '');

    // ADVPS only allows renewal close to expiry. A "not within renewal window"
    // rejection means the panel expiry is already well ahead — the service is
    // already renewed on the provider side (e.g. manual panel renewal). Treat
    // it as soft-success so callers sync expiry from the panel and the renewal
    // is not logged as a provider failure.
    if (/not within renewal window/i.test(msg)) {
      console.log(
        '[ADVPS-RENEW] Not within renewal window — panel expiry already ahead; treating as already renewed'
      );
      return {
        success: true,
        alreadyOutsideWindow: true,
        result: {
          ...(err.advpsBody && typeof err.advpsBody === 'object' ? err.advpsBody : {}),
          status: 'ok',
          message:
            'Already renewed on ADVPS panel (outside renewal window) — expiry synced from panel',
          upstreamMessage: msg,
        },
        serviceId,
        advpsOrderId,
      };
    }

    return {
      success: false,
      error: err.message,
      result: err.advpsBody || null,
      status: err.status,
      testMode,
      serviceId,
      advpsOrderId,
    };
  }
}

module.exports = {
  isAdvpsTestApiKey,
  isAdvpsTestModeResponse,
  validateAdvpsRenewalResult,
  executeAdvpsUpstreamRenewal,
};
