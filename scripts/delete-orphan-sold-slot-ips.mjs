import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const pkgs = await packagesCol.find({}).toArray();
let removed = 0;
const details = [];

for (const pkg of pkgs) {
  const nextIps = [];
  for (const ip of pkg.ips || []) {
    const isSoldHistory = !!(ip.allocated || ip.soldAt || ip.allocatedAt);
    if (!isSoldHistory) {
      nextIps.push(ip);
      continue;
    }

    const order = ip.orderId
      ? await ordersCol.findOne({ _id: ip.orderId })
      : await ordersCol.findOne({ slotIpId: String(ip._id) });

    if (order) {
      nextIps.push(ip);
      continue;
    }

    removed += 1;
    details.push({ packageName: pkg.name, proxy: ip.proxy });
  }

  if (nextIps.length !== (pkg.ips || []).length) {
    await packagesCol.updateOne({ _id: pkg._id }, { $set: { ips: nextIps } });
  }
}

console.log(JSON.stringify({ removed, details }, null, 2));
await mongoose.disconnect();
