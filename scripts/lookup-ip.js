require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const ip = process.argv[2];
if (!ip) {
  console.error('Usage: bun scripts/lookup-ip.js <ip>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const orders = await db.collection('orders').find({
    $or: [{ ipAddress: ip }, { ipAddress: { $regex: ip.replace(/\./g, '\\.') } }],
  }).toArray();

  console.log('orders:', orders.length);
  for (const o of orders) {
    console.log(JSON.stringify({
      id: String(o._id),
      ip: o.ipAddress,
      status: o.status,
      provisioningStatus: o.provisioningStatus,
      inventoryItemId: o.inventoryItemId,
      ipStockId: o.ipStockId,
      customerEmail: o.customerEmail,
      productName: o.productName,
    }, null, 2));
  }

  const stocks = await db.collection('ipstocks').find({
    company: { $exists: true },
    'inventoryItems.ipAddress': { $regex: ip.replace(/\./g, '\\.') },
  }).toArray();

  for (const s of stocks) {
    const matches = (s.inventoryItems || []).filter((i) => String(i.ipAddress).includes(ip));
    console.log('stock', s.name, String(s._id), 'company', String(s.company));
    for (const m of matches) {
      console.log('  item', JSON.stringify({
        _id: m._id,
        ip: m.ipAddress,
        allocated: m.allocated,
        orderId: m.orderId,
        username: m.username,
        os: m.os,
      }));
    }
  }

  await mongoose.disconnect();
})();
