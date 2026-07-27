require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;
  const orders = await db.collection('orders').find({ provider: 'smartvps' })
    .sort({ createdAt: -1 })
    .limit(8)
    .project({
      productName: 1,
      memory: 1,
      status: 1,
      provisioningStatus: 1,
      provisioningError: 1,
      ipAddress: 1,
      transactionId: 1,
      createdAt: 1,
    })
    .toArray();
  console.log(JSON.stringify(orders, null, 2));
  await mongoose.disconnect();
})();
