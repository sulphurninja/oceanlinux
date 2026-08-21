/**
 * Effective renewal status for admin logs — payment may succeed while upstream API fails.
 */
export function getRenewalLogApiStatus(log) {
  if (!log) return 'unknown';
  if (log.manualConfirmedAt) return 'manual_confirmed';
  if (log.providerApiResult?.apiCalled) {
    return log.providerApiResult.success ? 'api_success' : 'api_failed';
  }
  return log.success ? 'payment_success' : 'failed';
}

export function buildRenewalLogStatusFilter(apiStatus) {
  if (!apiStatus || apiStatus === 'all') return null;

  if (apiStatus === 'manual_confirmed') {
    return { manualConfirmedAt: { $exists: true, $ne: null } };
  }

  if (apiStatus === 'api_success') {
    return {
      manualConfirmedAt: { $in: [null, undefined] },
      'providerApiResult.apiCalled': true,
      'providerApiResult.success': true,
    };
  }

  if (apiStatus === 'api_failed') {
    return {
      manualConfirmedAt: { $in: [null, undefined] },
      'providerApiResult.apiCalled': true,
      'providerApiResult.success': false,
    };
  }

  if (apiStatus === 'failed') {
    return { success: false };
  }

  return null;
}
