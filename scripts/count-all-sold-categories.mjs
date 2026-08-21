import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

const pkgs = await packagesCol.find({}).toArray();
let orphan = 0;
let orderOver30 = 0;
let orderUnder30 = 0;

for (const pkg of pkgs) {
  for (const ip of pkg.ips || []) {
    if (!ip.allocated) continue;
    const order = ip.orderId
      ? await ordersCol.findOne({ _id: ip.orderId })
      : await ordersCol.findOne({ slotIpId: String(ip._id) });
    if (!order) {
      orphan += 1;
      continue;
    }
    if (new Date(order.createdAt) < cutoff) orderOver30 += 1;
    else orderUnder30 += 1;
  }
}

console.log({ orphan, orderOver30, orderUnder30, cutoff: cutoff.toISOString() });
await mongoose.disconnect();
