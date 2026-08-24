/**
 * Manual run: delete orders expired 3+ days (same logic as auto scheduler).
 * Usage:
 *   node scripts/run-expired-order-cleanup.js [--dry-run] [pay_xxx]
 */
const path = require('path');
const Module = require('module');
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, p, i, x) {
  if (r.startsWith('@/')) r = path.join(__dirname, '..', 'src', r.slice(2));
  return orig.call(this, r, p, i, x);
};

const connectDB = require('../src/lib/db').default;
const { deleteExpiredOrders } = require('../src/lib/cleanupExpiredOrders');

const dryRun = process.argv.includes('--dry-run');
const lookupTxn = process.argv.find((a) => a.startsWith('pay_'));

(async () => {
  await connectDB();
  const result = await deleteExpiredOrders({ dryRun });

  console.log(`Found ${result.matchedCount} expired orders (3+ days)`);

  if (lookupTxn) {
    const match = result.orders.find((o) => String(o.transactionId || '').includes(lookupTxn));
    console.log(
      match
        ? `Target ${lookupTxn}: ${dryRun ? 'WOULD DELETE' : 'DELETED'} — ${match.productName} (${match.ipAddress})`
        : `Target ${lookupTxn}: not in cleanup set`
    );
  }

  if (dryRun) {
    for (const o of result.orders.slice(0, 20)) {
      console.log(`- ${o.productName} | ${o.daysExpired}d | ${o.transactionId || '-'} | ${o.customerEmail}`);
    }
    if (result.orders.length > 20) console.log(`... and ${result.orders.length - 20} more`);
  } else {
    console.log(`Deleted ${result.deletedCount} expired orders`);
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
