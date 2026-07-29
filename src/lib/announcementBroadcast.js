import User from '@/models/userModel';
import Order from '@/models/orderModel';
import NotificationService from '@/services/notificationService';

const EmailService = require('@/lib/sendgrid');

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAnnouncementAudienceUsers(targetAudience = 'all') {
  switch (targetAudience) {
    case 'customers': {
      const customerIds = await Order.distinct('user');
      return User.find({ _id: { $in: customerIds }, email: { $exists: true, $ne: '' } })
        .select('_id name email')
        .lean();
    }
    case 'new-users': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return User.find({ createdAt: { $gte: thirtyDaysAgo }, email: { $exists: true, $ne: '' } })
        .select('_id name email')
        .lean();
    }
    case 'premium':
    case 'all':
    default:
      return User.find({ email: { $exists: true, $ne: '' } })
        .select('_id name email')
        .lean();
  }
}

/**
 * Email + in-app notification blast for a normal (non-popup) announcement.
 */
export async function broadcastAnnouncement(announcement) {
  const emailService = new EmailService();

  if (!emailService.isConfigured) {
    console.error('[ANNOUNCEMENT] Email service not configured — emails will be skipped');
  }

  const users = await getAnnouncementAudienceUsers(announcement.targetAudience);
  console.log(`[ANNOUNCEMENT] Broadcasting "${announcement.title}" to ${users.length} users`);

  let emailsSent = 0;
  let emailsFailed = 0;
  let notificationsSent = 0;
  let notificationsFailed = 0;
  const sampleErrors = [];

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (user) => {
        try {
          const emailResult = await emailService.sendAnnouncementEmail(
            user.email,
            user.name || 'Customer',
            {
              title: announcement.title,
              content: announcement.content,
              type: announcement.type || 'update',
              actionUrl: announcement.actionUrl,
              actionText: announcement.actionText || 'Learn More',
            },
            {
              announcementId: announcement._id,
              userId: user._id,
            }
          );

          if (emailResult?.success) {
            emailsSent++;
          } else {
            emailsFailed++;
            const errMsg = emailResult?.error || 'Unknown email error';
            if (sampleErrors.length < 5) sampleErrors.push(`${user.email}: ${errMsg}`);
            console.error(`[ANNOUNCEMENT] Email failed for ${user.email}:`, errMsg);
          }
        } catch (error) {
          emailsFailed++;
          if (sampleErrors.length < 5) sampleErrors.push(`${user.email}: ${error.message}`);
          console.error(`[ANNOUNCEMENT] Email error for ${user.email}:`, error.message);
        }

        try {
          await NotificationService.notifyAnnouncement(user._id, announcement, false);
          notificationsSent++;
        } catch (error) {
          notificationsFailed++;
          console.error(`[ANNOUNCEMENT] Notification failed for ${user._id}:`, error.message);
        }
      })
    );

    if (i + BATCH_SIZE < users.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  console.log(
    `[ANNOUNCEMENT] Complete — emails ok: ${emailsSent}, emails failed: ${emailsFailed}, notifications: ${notificationsSent}`
  );

  return {
    totalUsers: users.length,
    emailsSent,
    emailsFailed,
    notificationsSent,
    notificationsFailed,
    sampleErrors,
  };
}
