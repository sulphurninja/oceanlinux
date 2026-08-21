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
let falseInList = 0;
let falseNotInList = 0;
const toDelete = [];

for (const pkg of pkgs) {
  for (const ip of pkg.ips || []) {
    const key = `${ip.ip}:${ip.port}`;
    if (!ip.allocated) {
      if (releasedKeys.has(key)) {
        falseInList += 1;
        toDelete.push({ packageId: String(pkg._id), packageName: pkg.name, proxy: ip.proxy, key });
      } else {
        falseNotInList += 1;
      }
    }
  }
}

console.log({ falseInList, falseNotInList, sample: toDelete.slice(0, 10) });
await mongoose.disconnect();
