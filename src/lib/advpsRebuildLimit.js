/** Max ADVPS rebuild/format actions per billing window (calendar month, reset on renewal). */
const ADVPS_REBUILD_LIMIT = 15;

function currentBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function isAdvpsOrder(order) {
  return order?.provider === 'advps' || !!order?.advpsServiceId;
}

function getAdvpsRebuildUsage(order) {
  const currentMonth = currentBillingMonth();
  const storedMonth = order?.advpsRebuildCountMonth || '';
  const count = storedMonth === currentMonth ? (order?.advpsRebuildCount || 0) : 0;
  const remaining = Math.max(0, ADVPS_REBUILD_LIMIT - count);

  return {
    count,
    remaining,
    limit: ADVPS_REBUILD_LIMIT,
    limitReached: count >= ADVPS_REBUILD_LIMIT,
    currentMonth,
  };
}

/** Reset rebuild allowance after a successful ADVPS renewal. */
function getAdvpsRebuildResetFields() {
  return {
    advpsRebuildCount: 0,
    advpsRebuildCountMonth: currentBillingMonth(),
  };
}

function getAdvpsRebuildLimitMessage() {
  return `You can rebuild/format your server up to ${ADVPS_REBUILD_LIMIT} times per billing period. Your allowance resets when you renew and on the 1st of each month.`;
}

/** Consume one rebuild credit after ADVPS format/rebuild completes successfully. */
async function consumeAdvpsRebuildCredit(Order, orderId) {
  const order = await Order.findById(orderId).select('advpsRebuildCount advpsRebuildCountMonth').lean();
  if (!order) return false;

  const { count, currentMonth } = getAdvpsRebuildUsage(order);
  if (count >= ADVPS_REBUILD_LIMIT) {
    console.warn(`[ADVPS-REBUILD] Order ${orderId} already at limit (${count}/${ADVPS_REBUILD_LIMIT}), skipping credit`);
    return false;
  }

  await Order.findByIdAndUpdate(orderId, {
    advpsRebuildCount: count + 1,
    advpsRebuildCountMonth: currentMonth,
  });
  console.log(`[ADVPS-REBUILD] Order ${orderId} rebuild credit used: ${count + 1}/${ADVPS_REBUILD_LIMIT}`);
  return true;
}

module.exports = {
  ADVPS_REBUILD_LIMIT,
  isAdvpsOrder,
  getAdvpsRebuildUsage,
  getAdvpsRebuildResetFields,
  getAdvpsRebuildLimitMessage,
  consumeAdvpsRebuildCredit,
};
