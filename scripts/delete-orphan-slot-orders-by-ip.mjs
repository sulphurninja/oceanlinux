import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^MONGOOSE_URL=(.+)$/);
    if (m) return m[1].trim();
  }
  return process.env.MONGOOSE_URL || '';
}

const ips = readFileSync(resolve(process.cwd(), 'scripts/released-slot-ips-81.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const uri = loadEnv();
await mongoose.connect(uri);
const ordersCol = mongoose.connection.db.collection('orders');

const regexes = ips.map((ip) => new RegExp(`^\\s*${ip.replace(/\./g, '\\.')}`));
const orphanOrders = await ordersCol
  .find({
    $or: [
      { provider: 'slotip' },
      { slotIpPackageId: { $exists: true, $nin: [null, ''] } },
    ],
    $or: regexes.map((r) => ({ ipAddress: r })),
  })
  .project({ productName: 1, ipAddress: 1, customerEmail: 1, createdAt: 1 })
  .toArray();

// simpler query
const byIp = await ordersCol
  .find({
    ipAddress: { $in: ips },
  })
  .toArray();

const byRegex = [];
for (const ip of ips) {
  const rows = await ordersCol.find({ ipAddress: { $regex: ip.replace(/\./g, '\\.') } }).toArray();
  byRegex.push(...rows);
}

const unique = new Map();
for (const o of byRegex) unique.set(String(o._id), o);
const list = [...unique.values()];

const del = await ordersCol.deleteMany({ _id: { $in: list.map((o) => o._id) } });

console.log(JSON.stringify({ found: list.length, deleted: del.deletedCount, orders: list.map((o) => ({ id: String(o._id), ip: o.ipAddress, email: o.customerEmail })) }, null, 2));
await mongoose.disconnect();
