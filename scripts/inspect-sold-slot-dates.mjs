import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const proxies = [
  '2.27.114.72:46384:3H8DMIT8:K5JP1501',
  '45.12.80.248:46224:3H8DMIT8:K5JP1501',
  '212.180.122.71:47294:3H8DMIT8:K5JP1501',
  '79.175.115.135:45892:I8U808WM:NC7NGW09',
  '212.180.123.17:47822:I8U808WM:NC7NGW09',
];

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);

const pkgs = await packagesCol.find({}).toArray();
let soldRows = 0;
let expiredShouldRemove = 0;
let noSaleDate = 0;
const samples = [];

for (const pkg of pkgs) {
  for (const ip of pkg.ips || []) {
    if (!ip.allocated) continue;
    soldRows += 1;
    const sale = ip.soldAt || ip.allocatedAt || null;
    const saleDate = sale ? new Date(sale) : null;
    const daysSinceSale = saleDate
      ? Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const expired = saleDate ? saleDate < cutoff : true;

    if (expired) expiredShouldRemove += 1;
    if (!saleDate) noSaleDate += 1;

    if (proxies.includes(ip.proxy) || soldRows <= 5) {
      const orders = await ordersCol
        .find({ $or: [{ slotIpId: String(ip._id) }, { _id: ip.orderId }] })
        .project({ createdAt: 1, customerEmail: 1, ipAddress: 1 })
        .toArray();
      samples.push({
        proxy: ip.proxy,
        package: pkg.name,
        allocated: ip.allocated,
        soldAt: ip.soldAt,
        allocatedAt: ip.allocatedAt,
        orderId: ip.orderId,
        daysSinceSale,
        expired,
        orders: orders.map((o) => ({
          id: String(o._id),
          createdAt: o.createdAt,
          email: o.customerEmail,
        })),
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      now: new Date().toISOString(),
      cutoff: cutoff.toISOString(),
      totalSoldRows: soldRows,
      expiredShouldRemove,
      noSaleDate,
      samples,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
