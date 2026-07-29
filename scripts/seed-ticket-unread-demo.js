require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const EMAIL = 'rockybhai1@gmail.com';
const TICKET_ID = 'OCEAN-MRY1WM9K-T1HJYQ';

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({ email: EMAIL });
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }

  const ticket = await db.collection('supporttickets').findOne({ ticketId: TICKET_ID });
  if (!ticket) {
    console.error('Ticket not found:', TICKET_ID);
    process.exit(1);
  }

  const now = new Date();
  await db.collection('supporttickets').updateOne(
    { ticketId: TICKET_ID },
    {
      $set: {
        hasUnreadAdminReply: true,
        updatedAt: now,
        status: 'in-progress',
      },
      $push: {
        messages: {
          author: 'admin',
          authorName: 'Support Team',
          message:
            'Hi ROCKYADMIN, humne aapke IP issue ko check kiya hai. Please server restart karke dubara try karein. Agar phir bhi problem ho to humein reply karein.',
          timestamp: now,
          isInternal: false,
        },
      },
    }
  );

  const updated = await db.collection('supporttickets').findOne({ ticketId: TICKET_ID });
  console.log('Demo ready for', EMAIL);
  console.log(JSON.stringify({
    loginEmail: EMAIL,
    page: '/dashboard/support/tickets',
    ticketId: updated.ticketId,
    subject: updated.subject,
    hasUnreadAdminReply: updated.hasUnreadAdminReply,
    status: updated.status,
    messageCount: updated.messages?.length,
  }, null, 2));

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
