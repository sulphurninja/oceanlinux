const { isExpiredServiceForCustomer } = require('@/lib/expiryHelper');

const EXPIRED_SYNC_MESSAGE =
  'This service has expired. Sync is disabled so a resold IP cannot update this order.';

const EXPIRED_BLOCKED_ACTIONS = new Set([
  'sync',
  'status',
  'start',
  'stop',
  'restart',
  'reboot',
  'reinstall',
  'rebuild',
  'format',
  'changepassword',
  'generatepassword',
  'pullpassword',
  'resetmac',
  'reset-mac',
  'changeos',
  'templates',
]);

function expiredPanelSyncPayload(action = 'sync') {
  return {
    success: false,
    error: EXPIRED_SYNC_MESSAGE,
    message: EXPIRED_SYNC_MESSAGE,
    code: 'ORDER_EXPIRED',
    expired: true,
    action,
  };
}

function isExpiredPanelActionBlocked(action) {
  if (!action) return true;
  return EXPIRED_BLOCKED_ACTIONS.has(String(action).toLowerCase());
}

module.exports = {
  isExpiredServiceForCustomer,
  EXPIRED_SYNC_MESSAGE,
  expiredPanelSyncPayload,
  isExpiredPanelActionBlocked,
};
