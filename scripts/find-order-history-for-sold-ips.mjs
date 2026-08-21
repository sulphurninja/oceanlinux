import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const ordersCol = mongoose.connection.db.collection('orders');
const packagesCol = mongoose.connection.db.collection('slotippackages');

const pkg = await packagesCol.findOne({ name: /Dynamic Proxy Network/ });
const soldIps = (pkg?.ips || []).filter((ip) => ip.allocated).slice(0, 30);

for (const ip of soldIps) {
  const base = `${ip.ip}:${ip.port}`;
  const orders = await ordersCol
    .find({
      $or: [
        { slotIpId: String(ip._id) },
        { ipAddress: base },
        { ipAddress: new RegExp(`^${ip.ip.replace(/\./g, '\\.')}:${ip.port}`) },
        { username: ip.username },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(3)
    .project({ createdAt: 1, ipAddress: 1, username: 1, slotIpId: 1, customerEmail: 1 })
    .toArray();

  if (orders.length) {
    console.log(ip.proxy, '->', orders.map((o) => ({ createdAt: o.createdAt, ip: o.ipAddress, slotIpId: o.slotIpId })));
  }
}

const sampleOrder = await ordersCol.findOne({ provider: 'slotip' }, { sort: { createdAt: -1 } });
console.log('latest slotip order sample:', sampleOrder ? {
  createdAt: sampleOrder.createdAt,
  ip: sampleOrder.ipAddress,
  slotIpId: sampleOrder.slotIpId,
} : null);

const oldSlotOrders = await ordersCol.countDocuments({
  provider: 'slotip',
  createdAt: { $lt: new Date('2026-07-19') },
});
console.log('slotip orders older than 30d:', oldSlotOrders);

await mongoose.disconnect();
