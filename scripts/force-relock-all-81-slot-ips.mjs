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
if (!uri) process.exit(1);

const forceRelockKeys = readFileSync(resolve(process.cwd(), 'scripts/released-slot-ips-81.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

await mongoose.connect(uri);
const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

let relocked = 0;
let ordersCleared = 0;
const details = [];

for (const key of forceRelockKeys) {
  const [ip, portRaw] = key.split(':');
  const port = Number(portRaw);

  const pkg = await packagesCol.findOne({ 'ips.ip': ip, 'ips.port': port });
  if (!pkg) {
    details.push({ proxy: key, action: 'not_found' });
    continue;
  }

  const row = (pkg.ips || []).find((r) => String(r.ip) === ip && Number(r.port) === port);
  if (!row) {
    details.push({ proxy: key, action: 'row_not_found' });
    continue;
  }

  if (row.orderId) {
    const del = await ordersCol.deleteOne({ _id: row.orderId });
    if (del.deletedCount > 0) ordersCleared += 1;
  }

  await packagesCol.updateOne(
    { _id: pkg._id, 'ips._id': row._id },
    {
      $set: {
        'ips.$.allocated': true,
        'ips.$.orderId': null,
        'ips.$.allocatedAt': row.allocatedAt || new Date(),
      },
    },
  );
  relocked += 1;
  details.push({ proxy: key, action: 'force_relocked', hadOrderId: !!row.orderId });
}

console.log(JSON.stringify({ targetCount: forceRelockKeys.length, relocked, ordersCleared, details }, null, 2));
await mongoose.disconnect();
