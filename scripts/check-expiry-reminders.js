require('dotenv').config();
const mongoose = require('mongoose');

function getDaysUntilExpiry(expiryDate) {
  if (!expiryDate) return 0;
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;
  const ACTIVE = ['confirmed', 'active', 'paid', 'completed'];

  const orders = await db
    .collection('orders')
    .find({
      expiryDate: { $exists: true, $ne: null, $gt: new Date() },
      status: { $in: ACTIVE },
    })
    .project({
      expiryDate: 1,
      status: 1,
      productName: 1,
      paymentDetails: 1,
    })
    .toArray();

  const byDays = {};
  for (const o of orders) {
    const d = getDaysUntilExpiry(o.expiryDate);
    byDays[d] = (byDays[d] || 0) + 1;
  }

  const twoDay = orders.filter((o) => getDaysUntilExpiry(o.expiryDate) === 2);
  const near = orders.filter((o) => {
    const d = getDaysUntilExpiry(o.expiryDate);
    return d >= 1 && d <= 3;
  });

  console.log('Total active orders with future expiry:', orders.length);
  console.log('Distribution daysLeft:', JSON.stringify(byDays, null, 2));
  console.log('Exactly 2 days left:', twoDay.length);
  console.log('1-3 days left:', near.length);

  if (twoDay.length) {
    console.log(
      'Sample 2-day orders:',
      JSON.stringify(
        twoDay.slice(0, 5).map((o) => ({
          id: String(o._id),
          status: o.status,
          days: getDaysUntilExpiry(o.expiryDate),
          expiry: o.expiryDate,
          reminded: o.paymentDetails?.expiryReminder2dFor || null,
        })),
        null,
        2
      )
    );
  }

  const noExpiry = await db.collection('orders').countDocuments({
    status: { $in: ACTIVE },
    $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }],
  });
  console.log('Active orders WITHOUT expiryDate:', noExpiry);

  const reminded = await db.collection('orders').countDocuments({
    'paymentDetails.expiryReminder2dFor': { $exists: true, $ne: null },
  });
  console.log('Orders ever flagged expiryReminder2dFor:', reminded);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
