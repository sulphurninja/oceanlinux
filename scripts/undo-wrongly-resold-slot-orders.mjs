import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^MONGOOSE_URL=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    // ignore
  }
  return process.env.MONGOOSE_URL || '';
}

const uri = loadEnv();
if (!uri) process.exit(1);

const wronglyResoldOrderIds = [
  '6a04ada829684e8dee6c8d33',
  '6a04ad7329684e8dee6c878b',
  '6a04ad2a29684e8dee6c7e74',
  '6a04acc129684e8dee6c741f',
  '6a04acb129684e8dee6c6fc2',
  '6a04ac6e29684e8dee6c64cc',
  '6a04ac2229684e8dee6c5bd2',
  '6a04ab3629684e8dee6c4d6f',
  '6a04aab829684e8dee6c436b',
  '6a04aa0c29684e8dee6c340f',
  '6a04a92d29684e8dee6c250b',
  '6a049d8929684e8dee6b85ef',
  '6a049d4429684e8dee6b80ec',
  '6a049b2e29684e8dee6b6907',
  '6a049aa629684e8dee6b5e35',
  '6a049a8529684e8dee6b5acf',
  '6a0498eb29684e8dee6b4242',
  '6a0496f429684e8dee6b2456',
  '6a0494f329684e8dee6afcdc',
  '6a04946c29684e8dee6aedfb',
  '6a0493e629684e8dee6ae049',
  '6a0493cd29684e8dee6adc37',
  '6a04938129684e8dee6ad101',
  '6a04933929684e8dee6ac9b0',
  '6a04930029684e8dee6abce8',
  '6a30362e55e48a7a48a77933',
];

await mongoose.connect(uri);
const ordersCol = mongoose.connection.db.collection('orders');
const packagesCol = mongoose.connection.db.collection('slotippackages');

const objectIds = wronglyResoldOrderIds.map((id) => new mongoose.Types.ObjectId(id));
const orders = await ordersCol.find({ _id: { $in: objectIds } }).toArray();

let relocked = 0;
for (const order of orders) {
  if (order.slotIpPackageId && order.slotIpId) {
    await packagesCol.updateOne(
      {
        _id: new mongoose.Types.ObjectId(String(order.slotIpPackageId)),
        'ips._id': new mongoose.Types.ObjectId(String(order.slotIpId)),
      },
      {
        $set: {
          'ips.$.allocated': true,
          'ips.$.orderId': null,
          'ips.$.allocatedAt': new Date(),
        },
      },
    );
    relocked += 1;
  }
}

const deleteResult = await ordersCol.deleteMany({ _id: { $in: objectIds } });

console.log(
  JSON.stringify(
    {
      ordersFound: orders.length,
      ordersDeleted: deleteResult.deletedCount,
      proxiesRelocked: relocked,
      deletedOrders: orders.map((o) => ({
        id: String(o._id),
        email: o.customerEmail || null,
        ip: o.ipAddress || null,
        productName: o.productName,
      })),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
