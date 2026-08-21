import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const ips = [
  '103.240.212.233',
  '103.240.214.2',
  '103.240.214.3',
  '103.240.214.25',
  '103.240.214.26',
  '79.175.115.150',
];

for (const ip of ips) {
  const pkg = await packagesCol.findOne({ 'ips.ip': ip });
  if (!pkg) {
    console.log(ip, 'NOT IN DB');
    continue;
  }
  const row = (pkg.ips || []).find((r) => r.ip === ip);
  console.log('---', ip, 'pkg:', pkg.name);
  console.log(
    JSON.stringify(
      {
        allocated: row.allocated,
        orderId: row.orderId,
        allocatedAt: row.allocatedAt,
        proxy: row.proxy,
      },
      null,
      2,
    ),
  );
  if (row.orderId) {
    const o = await ordersCol.findOne({ _id: row.orderId });
    console.log(
      'linked order:',
      o
        ? {
            id: String(o._id),
            createdAt: o.createdAt,
            email: o.customerEmail,
            provider: o.provider,
          }
        : 'MISSING',
    );
  }
  const ordersByIp = await ordersCol
    .find({ ipAddress: new RegExp(ip.replace(/\./g, '\\.')) })
    .project({ createdAt: 1, customerEmail: 1, provider: 1, slotIpPackageId: 1, ipAddress: 1 })
    .limit(5)
    .toArray();
  console.log('orders matching ip:', ordersByIp.length);
  for (const o of ordersByIp) {
    console.log(' ', {
      id: String(o._id),
      createdAt: o.createdAt,
      email: o.customerEmail,
      ip: o.ipAddress,
    });
  }
}

await mongoose.disconnect();
