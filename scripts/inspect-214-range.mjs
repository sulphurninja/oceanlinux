import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const pkg = await packagesCol.findOne({ name: /103\.211\.170/ });
if (!pkg) {
  console.log('package not found');
  process.exit(1);
}

const range = (pkg.ips || []).filter((ip) => ip.ip?.startsWith('103.240.214.'));
const falseAvail = range.filter((ip) => !ip.allocated);
const trueSold = range.filter((ip) => ip.allocated);

console.log('103.240.214.* stats:', {
  total: range.length,
  available: falseAvail.length,
  sold: trueSold.length,
});

for (const ip of falseAvail.slice(0, 10)) {
  const orders = await ordersCol
    .find({ slotIpId: String(ip._id) })
    .project({ createdAt: 1, customerEmail: 1, ipAddress: 1 })
    .toArray();
  console.log('AVAILABLE row', ip.proxy, 'ordersBySlotIpId:', orders.length);
  for (const o of orders) {
    console.log(' ', String(o._id), o.createdAt, o.customerEmail, o.ipAddress);
  }
}

const orphanSold = [];
for (const ip of trueSold) {
  const orders = await ordersCol.find({ slotIpId: String(ip._id) }).toArray();
  if (!orders.length && !ip.orderId) orphanSold.push(ip.proxy);
}
console.log('orphan sold (allocated true, no order):', orphanSold.length, orphanSold.slice(0, 5));

await mongoose.disconnect();
