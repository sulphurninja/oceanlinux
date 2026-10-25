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

const ADVPS_REBUILD_DONE = new Set(['COMPLETED', 'SUCCESS', 'DONE', 'COMPLETE', 'FINISHED']);
const ADVPS_REBUILD_FAILED = new Set(['FAILED', 'ERROR', 'CANCELLED', 'CANCELED']);

function readAdvpsRebuildTaskStatus(taskRes) {
  const data = taskRes?.data && typeof taskRes.data === 'object' ? taskRes.data : taskRes;
  return String(data?.status || data?.taskStatus || data?.state || '').trim().toUpperCase();
}

/**
 * Drop one credit only for the saved in-flight task. A second caller that
 * already cleared the task id does not decrement again.
 */
async function consumeAdvpsRebuildCreditForTask(Order, orderId, taskId) {
  const wanted = String(taskId || '').trim();
  if (!wanted) return false;

  const order = await Order.findById(orderId)
    .select('advpsRebuildCount advpsRebuildCountMonth advpsRebuildTaskId')
    .lean();
  if (!order || String(order.advpsRebuildTaskId || '') !== wanted) return false;

  const { count, currentMonth } = getAdvpsRebuildUsage(order);
  if (count >= ADVPS_REBUILD_LIMIT) {
    await Order.updateOne(
      { _id: orderId, advpsRebuildTaskId: wanted },
      { $unset: { advpsRebuildTaskId: 1 } }
    );
    return false;
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, advpsRebuildTaskId: wanted },
    {
      $set: {
        advpsRebuildCount: count + 1,
        advpsRebuildCountMonth: currentMonth,
      },
      $unset: { advpsRebuildTaskId: 1 },
    }
  );
  if (!updated) return false;
  console.log(`[ADVPS-REBUILD] Order ${orderId} rebuild credit used: ${count + 1}/${ADVPS_REBUILD_LIMIT} (task ${wanted})`);
  return true;
}

/**
 * One lookup of the rebuild task saved on the order.
 * Completed → minus 1. Failed → stay the same and forget the task. Still running → leave 15.
 */
async function settlePendingAdvpsRebuild(api, Order, order) {
  const taskId = String(order?.advpsRebuildTaskId || '').trim();
  const orderId = order?._id;
  if (!taskId || !orderId) return { state: 'none' };

  let taskRes;
  try {
    taskRes = await api.taskStatus(taskId);
  } catch (err) {
    if (err.status === 404) {
      await Order.updateOne(
        { _id: orderId, advpsRebuildTaskId: taskId },
        { $unset: { advpsRebuildTaskId: 1 } }
      );
      return { state: 'missing' };
    }
    console.warn(`[ADVPS-REBUILD] Task ${taskId} status check failed: ${err.message}`);
    return { state: 'pending' };
  }

  const status = readAdvpsRebuildTaskStatus(taskRes);
  if (ADVPS_REBUILD_DONE.has(status)) {
    const consumed = await consumeAdvpsRebuildCreditForTask(Order, orderId, taskId);
    return { state: 'completed', consumed, status };
  }
  if (ADVPS_REBUILD_FAILED.has(status)) {
    await Order.updateOne(
      { _id: orderId, advpsRebuildTaskId: taskId, provisioningStatus: 'provisioning' },
      {
        $unset: { advpsRebuildTaskId: 1 },
        $set: { provisioningStatus: 'failed', provisioningError: 'Rebuild task failed' },
      }
    );
    await Order.updateOne(
      { _id: orderId, advpsRebuildTaskId: taskId },
      { $unset: { advpsRebuildTaskId: 1 } }
    );
    console.warn(`[ADVPS-REBUILD] Order ${orderId} task ${taskId} ${status} — credit not used`);
    return { state: 'failed', status };
  }
  return { state: 'pending', status };
}

module.exports = {
  ADVPS_REBUILD_LIMIT,
  isAdvpsOrder,
  getAdvpsRebuildUsage,
  getAdvpsRebuildResetFields,
  getAdvpsRebuildLimitMessage,
  consumeAdvpsRebuildCredit,
  consumeAdvpsRebuildCreditForTask,
  readAdvpsRebuildTaskStatus,
  settlePendingAdvpsRebuild,
};
