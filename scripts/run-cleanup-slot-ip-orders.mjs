import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^MONGOOSE_URL=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    // ignore
  }
  return process.env.MONGOOSE_URL || '';
}

const uri = loadEnv();
if (!uri) {
  console.error('MONGOOSE_URL not found');
  process.exit(1);
}

const olderThanDays = 30;
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - olderThanDays);

const query = {
  createdAt: { $lt: cutoff },
  $or: [
    { provider: 'slotip' },
    { slotIpPackageId: { $exists: true, $nin: [null, ''] } },
  ],
};

await mongoose.connect(uri);
const ordersCol = mongoose.connection.db.collection('orders');

const toDelete = await ordersCol
  .find(query)
  .project({
    productName: 1,
    status: 1,
    ipAddress: 1,
    createdAt: 1,
    customerEmail: 1,
  })
  .toArray();

// Order record only — keep package row allocated so proxy is never resold.
const deleteResult = await ordersCol.deleteMany({ _id: { $in: toDelete.map((o) => o._id) } });

console.log(
  JSON.stringify(
    {
      deletedCount: deleteResult.deletedCount,
      releasedSlotIps: 0,
      note: 'Proxy rows left allocated — not returned to sell pool',
      olderThanDays,
      orders: toDelete.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        email: o.customerEmail || null,
        ip: o.ipAddress || null,
        createdAt: o.createdAt,
      })),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
