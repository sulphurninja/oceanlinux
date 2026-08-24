/**
 * EC2/PM2: auto-delete expired orders without relying on Vercel cron or system crontab.
 * Runs on the main app process only (PORT 3000).
 */
const connectDB = require('@/lib/db').default;
const { deleteExpiredOrders, EXPIRED_GRACE_DAYS } = require('@/lib/cleanupExpiredOrders');

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2 * 60 * 1000;

let running = false;
let started = false;

async function runExpiredOrderCleanupJob() {
  if (running) return;
  running = true;
  try {
    await connectDB();
    const result = await deleteExpiredOrders({ graceDays: EXPIRED_GRACE_DAYS });
    if (result.deletedCount > 0) {
      console.log(
        `[SCHEDULED-CLEANUP] Deleted ${result.deletedCount} expired orders (${EXPIRED_GRACE_DAYS}+ day grace)`
      );
    }
  } catch (err) {
    console.error('[SCHEDULED-CLEANUP] Failed:', err?.message || err);
  } finally {
    running = false;
  }
}

function startScheduledOrderCleanup() {
  if (started) return;
  started = true;

  console.log(
    `[SCHEDULED-CLEANUP] Enabled — checks every ${INTERVAL_MS / 3600000}h, deletes orders ${EXPIRED_GRACE_DAYS}+ days past expiry`
  );

  setTimeout(() => {
    runExpiredOrderCleanupJob();
  }, STARTUP_DELAY_MS);

  setInterval(runExpiredOrderCleanupJob, INTERVAL_MS);
}

module.exports = {
  startScheduledOrderCleanup,
  runExpiredOrderCleanupJob,
};
