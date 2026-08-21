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

const pkg = await packagesCol.findOne({ name: /Dynamic Proxy Network/ });
const rows = pkg?.ips || [];

let orphan = 0;
let activeUnder30 = 0;
let activeOver30 = 0;
const over30Samples = [];

for (const ip of rows) {
  if (!ip.allocated) continue;
  const order = ip.orderId
    ? await ordersCol.findOne({ _id: ip.orderId })
    : await ordersCol.findOne({ slotIpId: String(ip._id) });

  if (!order) {
    orphan += 1;
    continue;
  }

  if (new Date(order.createdAt) < cutoff) {
    activeOver30 += 1;
    if (over30Samples.length < 10) {
      over30Samples.push({
        proxy: ip.proxy,
        orderCreated: order.createdAt,
        allocatedAt: ip.allocatedAt,
        soldAt: ip.soldAt,
      });
    }
  } else {
    activeUnder30 += 1;
  }
}

console.log(
  JSON.stringify(
    {
      package: pkg?.name,
      totalSold: rows.filter((r) => r.allocated).length,
      orphan,
      activeUnder30,
      activeOver30,
      over30Samples,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
