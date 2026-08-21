import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const pkgs = await packagesCol.find({}).toArray();
let orphanSold = 0;
let activeSold = 0;
let available = 0;

for (const pkg of pkgs) {
  for (const ip of pkg.ips || []) {
    if (!ip.allocated) {
      available += 1;
      continue;
    }
    const order = ip.orderId
      ? await ordersCol.findOne({ _id: ip.orderId })
      : await ordersCol.findOne({ slotIpId: String(ip._id) });
    if (order) activeSold += 1;
    else orphanSold += 1;
  }
}

console.log({ orphanSold, activeSold, available });
await mongoose.disconnect();
