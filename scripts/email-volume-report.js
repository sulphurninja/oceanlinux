require('dotenv').config();
const mongoose = require('mongoose');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const orders = await db
    .collection('orders')
    .find({ createdAt: { $gte: since } })
    .project({
      createdAt: 1,
      status: 1,
      transactionId: 1,
      paymentDetails: 1,
      renewalPayments: 1,
      customerEmail: 1,
    })
    .toArray();

  const users = await db.collection('users').countDocuments({ createdAt: { $gte: since } });
  const tickets = await db
    .collection('supporttickets')
    .find({ createdAt: { $gte: since } })
    .project({ createdAt: 1, messages: 1 })
    .toArray();

  let announcements = [];
  try {
    announcements = await db
      .collection('announcements')
      .find({ createdAt: { $gte: since } })
      .project({ createdAt: 1, sentCount: 1, recipientCount: 1 })
      .toArray();
  } catch {
    /* collection may not exist */
  }

  const paidWithTxn = orders.filter(
    (o) => (o.transactionId && o.transactionId !== '') || o.paymentDetails?.razorpay_payment_id
  );
  const completionSent = orders.filter((o) => o.paymentDetails?.completionEmailSentAt);
  const confirmSent = orders.filter((o) => o.paymentDetails?.confirmationEmailSentAt);

  let renewalCount = 0;
  for (const o of orders) {
    for (const rp of o.renewalPayments || []) {
      const d = rp.paidAt || rp.createdAt;
      if (d && new Date(d) >= since) renewalCount++;
    }
  }

  let adminReplies = 0;
  const ticketsCreated = tickets.length;
  for (const t of tickets) {
    for (const m of t.messages || []) {
      if (m.author === 'admin' && new Date(m.timestamp) >= since) adminReplies++;
    }
  }

  const expiryCandidates = await db
    .collection('orders')
    .find({
      expiryDate: { $exists: true, $ne: null },
      status: { $in: ['active', 'confirmed', 'paid', 'completed'] },
    })
    .project({ expiryDate: 1, paymentDetails: 1 })
    .toArray();
  const expiryRemindersSent = expiryCandidates.filter((o) => o.paymentDetails?.expiryReminder2dFor).length;

  let announcementEmails = 0;
  for (const a of announcements) {
    announcementEmails += a.sentCount || a.recipientCount || 0;
  }

  const byDay = {};
  for (const o of paidWithTxn) {
    const day = new Date(o.createdAt).toISOString().slice(0, 10);
    byDay[day] = byDay[day] || { orders: 0, completion: 0, confirm: 0 };
    byDay[day].orders++;
    if (o.paymentDetails?.completionEmailSentAt) byDay[day].completion++;
    if (o.paymentDetails?.confirmationEmailSentAt) byDay[day].confirm++;
  }

  const totalUsers = await db.collection('users').countDocuments({});

  const est = {
    orderPaymentConfirmed: confirmSent.length || paidWithTxn.length,
    orderServerReady: completionSent.length,
    renewals: renewalCount,
    signups: users,
    ticketCreated: ticketsCreated,
    adminTicketReplies: adminReplies,
    expiryRemindersTracked: expiryRemindersSent,
    announcementBlasts: announcementEmails,
  };

  const totalEst = Object.values(est).reduce((a, b) => a + b, 0);

  console.log('=== LAST', DAYS, 'DAYS EMAIL VOLUME ESTIMATE ===');
  console.log(JSON.stringify(est, null, 2));
  console.log('Total estimated emails (30d):', totalEst);
  console.log('Avg per day:', Math.round(totalEst / DAYS));
  console.log('');
  console.log('=== PER CATEGORY (sorted) ===');
  for (const [k, v] of Object.entries(est).sort((a, b) => b[1] - a[1])) {
    console.log(k + ':', v, '(' + Math.round((v / totalEst) * 100) + '%)');
  }
  console.log('');
  console.log('=== TOP 10 BUSIEST DAYS ===');
  const sorted = Object.entries(byDay)
    .sort((a, b) => b[1].orders - a[1].orders)
    .slice(0, 10);
  for (const [day, v] of sorted) {
    console.log(day, '| paid orders:', v.orders, '| confirm:', v.confirm, '| server ready:', v.completion);
  }
  console.log('');
  console.log('Total registered users (max announcement blast):', totalUsers);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
