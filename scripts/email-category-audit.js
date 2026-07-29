require('dotenv').config();
const mongoose = require('mongoose');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const orders = await db.collection('orders').find({ createdAt: { $gte: since } }).toArray();
  const allOrders = await db.collection('orders').find({}).project({ paymentDetails: 1, renewalPayments: 1, transactionId: 1 }).toArray();

  let confirmSent = 0;
  let completionSent = 0;
  let renewalEmailSent = 0;
  let expiryReminded = 0;
  let paidOrders = 0;

  for (const o of allOrders) {
    if (o.transactionId || o.paymentDetails?.razorpay_payment_id) paidOrders++;
    if (o.paymentDetails?.confirmationEmailSentAt) confirmSent++;
    if (o.paymentDetails?.completionEmailSentAt) completionSent++;
    if (o.paymentDetails?.expiryReminder2dFor) expiryReminded++;
    for (const rp of o.renewalPayments || []) {
      if (rp.emailSentAt) renewalEmailSent++;
    }
  }

  const signups = await db.collection('users').countDocuments({ createdAt: { $gte: since } });
  const passwordResets = await db.collection('passwordresets').countDocuments({ createdAt: { $gte: since } }).catch(() => 0);

  const ticketsCreated = await db.collection('supporttickets').countDocuments({ createdAt: { $gte: since } });

  let adminReplies = 0;
  const tickets = await db.collection('supporttickets').find({ createdAt: { $gte: since } }).project({ messages: 1 }).toArray();
  for (const t of tickets) {
    for (const m of t.messages || []) {
      if (m.author === 'admin' && new Date(m.timestamp) >= since) adminReplies++;
    }
  }

  const announcements = await db.collection('announcements').find({}).project({ sentCount: 1, recipientCount: 1, status: 1 }).toArray().catch(() => []);

  const emailVerifications = await db.collection('emailverifications').countDocuments({ createdAt: { $gte: since } }).catch(() => 0);

  console.log('=== EMAIL CATEGORY HEALTH (30 days / all-time flags) ===\n');
  console.log(JSON.stringify({
    paymentConfirmed_tracked: confirmSent,
    serverReady_tracked: completionSent,
    paidOrdersApprox: paidOrders,
    signups_30d: signups,
    passwordResets_30d: passwordResets,
    ticketsCreated_30d: ticketsCreated,
    adminTicketReplies_30d: adminReplies,
    renewalEmails_tracked: renewalEmailSent,
    expiryReminders_tracked: expiryReminded,
    emailChangeRequests_30d: emailVerifications,
    announcements_total: announcements.length,
    serviceSuspended_emails: 'NEVER WIRED (notifyServiceSuspended not called anywhere)',
  }, null, 2));

  // Gap analysis
  const confirmGap = paidOrders - confirmSent;
  const completionGap = confirmSent - completionSent;
  console.log('\n=== GAPS (orders missing email flags) ===');
  console.log('Paid but no confirmation flag:', confirmGap);
  console.log('Confirmed-ish but no completion flag:', completionGap);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
