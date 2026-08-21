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
  $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }],
  createdAt: { $lt: cutoff },
};

await mongoose.connect(uri);
const col = mongoose.connection.db.collection('orders');

const total = await col.countDocuments(query);
const byProvider = await col
  .aggregate([
    { $match: query },
    { $group: { _id: '$provider', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])
  .toArray();

const byStatus = await col
  .aggregate([
    { $match: query },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])
  .toArray();

const withIp = await col.countDocuments({ ...query, ipAddress: { $nin: [null, ''] } });
const sample = await col
  .find(query)
  .project({ productName: 1, status: 1, ipAddress: 1, createdAt: 1, provider: 1 })
  .sort({ createdAt: -1 })
  .limit(10)
  .toArray();

const vpsOnlyQuery = {
  ...query,
  slotIpPackageId: { $in: [null, ''] },
  provider: { $ne: 'slotip' },
};

const vpsTotal = await col.countDocuments(vpsOnlyQuery);
const vpsSample = await col
  .find(vpsOnlyQuery)
  .project({ productName: 1, status: 1, ipAddress: 1, createdAt: 1, provider: 1 })
  .sort({ createdAt: -1 })
  .limit(15)
  .toArray();

console.log(
  JSON.stringify(
    {
      total,
      vpsOnlyTotal: vpsTotal,
      slotIpTotal: total - vpsTotal,
      withIp,
      withoutIp: total - withIp,
      cutoff: cutoff.toISOString(),
      byStatus,
      byProvider,
      vpsSample: vpsSample.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        status: o.status,
        ip: o.ipAddress || null,
        createdAt: o.createdAt,
        provider: o.provider || null,
      })),
      sample: sample.map((o) => ({
        id: String(o._id),
        productName: o.productName,
        status: o.status,
        ip: o.ipAddress || null,
        createdAt: o.createdAt,
        provider: o.provider || null,
      })),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
