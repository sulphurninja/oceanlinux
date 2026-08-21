import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);
const orders = mongoose.connection.db.collection('orders');
const found = await orders.find({
  $or: [
    { customerEmail: /urmila\.jnu1000/i },
    { customerName: /Amarr/i },
  ],
}).sort({ createdAt: -1 }).project({
  productName: 1, status: 1, provisioningStatus: 1, provisioningError: 1,
  provider: 1, ipAddress: 1, memory: 1, createdAt: 1, expiryDate: 1, customerName: 1, customerEmail: 1,
}).toArray();
console.log(JSON.stringify(found.map((o) => ({
  id: String(o._id),
  name: o.customerName,
  email: o.customerEmail,
  product: o.productName,
  memory: o.memory,
  status: o.status,
  prov: o.provisioningStatus,
  err: o.provisioningError,
  ip: o.ipAddress,
  createdAt: o.createdAt,
  expiryDate: o.expiryDate,
})), null, 2));
await mongoose.disconnect();
