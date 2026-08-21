import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const target = '103.240.214.2';
const pkgs = await packagesCol.find({ 'ips.ip': target }).toArray();
console.log('packages with', target, ':', pkgs.length);
for (const pkg of pkgs) {
  const rows = (pkg.ips || []).filter((r) => r.ip === target);
  console.log('pkg', pkg.name, 'rows', rows.length);
  for (const r of rows) {
    console.log(JSON.stringify({ _id: String(r._id), allocated: r.allocated, orderId: r.orderId, allocatedAt: r.allocatedAt, proxy: r.proxy }));
    const orders = await ordersCol.find({ slotIpId: String(r._id) }).toArray();
    console.log(' orders', orders.map((o) => ({ id: String(o._id), createdAt: o.createdAt, email: o.customerEmail })));
  }
}

await mongoose.disconnect();
