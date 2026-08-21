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

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

const query = {
  $and: [
    { $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }] },
    { createdAt: { $lt: cutoff } },
    { provider: { $ne: 'slotip' } },
    {
      $or: [
        { slotIpPackageId: null },
        { slotIpPackageId: '' },
        { slotIpPackageId: { $exists: false } },
      ],
    },
  ],
};

await mongoose.connect(uri);
const col = mongoose.connection.db.collection('orders');

const toDelete = await col
  .find(query)
  .project({ productName: 1, status: 1, ipAddress: 1, createdAt: 1 })
  .toArray();

if (toDelete.length === 0) {
  console.log(JSON.stringify({ deletedCount: 0, message: 'No matching orders' }, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

const result = await col.deleteMany({ _id: { $in: toDelete.map((o) => o._id) } });

console.log(
  JSON.stringify(
    {
      deletedCount: result.deletedCount,
      orders: toDelete.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        status: o.status,
        ip: o.ipAddress || null,
        createdAt: o.createdAt,
      })),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
