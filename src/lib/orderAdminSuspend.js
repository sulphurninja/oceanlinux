function isOrderAdminSuspended(order) {
  return Boolean(order?.adminSuspended);
}

function getOrderAdminSuspendMessage(order) {
  const msg = String(order?.adminSuspendMessage || '').trim();
  return msg || 'This service has been suspended by the administrator. Please contact support.';
}

function orderAdminSuspendPayload(order) {
  return {
    success: false,
    error: getOrderAdminSuspendMessage(order),
    adminSuspended: true,
    code: 'ORDER_ADMIN_SUSPENDED',
  };
}

/**
 * Block customer actions on admin-suspended orders (admins + internal bypass exempt).
 */
function assertOrderNotAdminSuspended(order, { isAdmin = false, internalBypass = false } = {}) {
  if (internalBypass || isAdmin || !isOrderAdminSuspended(order)) {
    return null;
  }
  return orderAdminSuspendPayload(order);
}

module.exports = {
  isOrderAdminSuspended,
  getOrderAdminSuspendMessage,
  orderAdminSuspendPayload,
  assertOrderNotAdminSuspended,
};
