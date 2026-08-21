require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const ip = process.argv[2];
if (!ip) {
  console.error('Usage: bun scripts/lookup-renewal-price.js <ip>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const order = await db.collection('orders').findOne({ ipAddress: ip });
  if (!order) {
    console.log('Order not found');
    process.exit(1);
  }

  const stock = order.ipStockId
    ? await db.collection('ipstocks').findOne({ _id: new mongoose.Types.ObjectId(String(order.ipStockId)) })
    : null;

  console.log('ORDER', {
    id: String(order._id),
    price: order.price,
    originalPrice: order.originalPrice,
    promoCode: order.promoCode,
    promoDiscount: order.promoDiscount,
    memory: order.memory,
    productName: order.productName,
    ipStockId: String(order.ipStockId),
  });

  if (stock) {
    const mem = order.memory || '8GB';
    const opts = stock.memoryOptions || {};
    const tier = opts[mem] || opts['8GB'];
    console.log('LINKED STOCK', {
      id: String(stock._id),
      name: stock.name,
      memoryTierPrice: tier?.price ?? null,
      memoryOptions: stock.memoryOptions,
    });
  }

  const related = await db.collection('ipstocks').find({
    $or: [
      { name: /160\.191/i },
      { name: /Broadband/i },
      { 'inventoryItems.ipAddress': ip },
    ],
  }).toArray();

  console.log('\nMATCHING STOCKS:', related.length);
  for (const s of related) {
    const mem8 = s.memoryOptions?.['8GB']?.price;
    console.log({
      id: String(s._id),
      name: s.name,
      '8GB price': mem8,
      linkedToOrder: String(s._id) === String(order.ipStockId),
    });
  }

  await mongoose.disconnect();
})();
