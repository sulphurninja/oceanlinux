import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
const releasedKeys = new Set(
  readFileSync(resolve(process.cwd(), 'scripts/released-slot-ips-81.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean),
);

await mongoose.connect(uri);
const packagesCol = mongoose.connection.db.collection('slotippackages');

const pkgs = await packagesCol.find({}).toArray();
let removed = 0;
const details = [];

for (const pkg of pkgs) {
  const before = (pkg.ips || []).length;
  const nextIps = (pkg.ips || []).filter((ip) => {
    const key = `${ip.ip}:${ip.port}`;
    const shouldRemove = !ip.allocated && releasedKeys.has(key);
    if (shouldRemove) {
      removed += 1;
      details.push({ packageName: pkg.name, proxy: ip.proxy });
    }
    return !shouldRemove;
  });
  if (nextIps.length !== before) {
    await packagesCol.updateOne({ _id: pkg._id }, { $set: { ips: nextIps } });
  }
}

console.log(JSON.stringify({ removed, details }, null, 2));
await mongoose.disconnect();
