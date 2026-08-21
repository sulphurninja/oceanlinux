import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const orderId = '6a6799dd3883dc7c6c76b43b';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const ordersCol = mongoose.connection.db.collection('orders');
const stocksCol = mongoose.connection.db.collection('ipstocks');

const order = await ordersCol.findOne({ _id: new mongoose.Types.ObjectId(orderId) });
console.log('ORDER', JSON.stringify(order, null, 2));

const stock = await ordersCol.findOne({ _id: new mongoose.Types.ObjectId(orderId) }).then(async () => {
  return stocksCol.findOne({ _id: new mongoose.Types.ObjectId(order.ipStockId) });
});
console.log('STOCK name', stock?.name, 'company', stock?.company);

const invId = order.inventoryItemId;
if (invId) {
  const item = (stock?.inventoryItems || []).find((i) => String(i._id) === String(invId));
  console.log('INVENTORY BY ID', JSON.stringify(item, null, 2));
}

const byOldIp = (stock?.inventoryItems || []).filter((i) => String(i.ipAddress || i.ip || '').includes('162.4.147.4'));
const byNewIp = (stock?.inventoryItems || []).filter((i) => String(i.ipAddress || i.ip || '').includes('103.148.205.60'));
console.log('inventory old ip matches', byOldIp.length, byOldIp);
console.log('inventory new ip matches', byNewIp.length, byNewIp);

const ordersWithOld = await ordersCol.find({ ipAddress: /162\.4\.147\.4/ }).project({ _id: 1, customerEmail: 1, inventoryItemId: 1 }).toArray();
const ordersWithNew = await ordersCol.find({ ipAddress: /103\.148\.205\.60/ }).project({ _id: 1, customerEmail: 1, inventoryItemId: 1 }).toArray();
console.log('orders old', ordersWithOld);
console.log('orders new', ordersWithNew);

await mongoose.disconnect();
