import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import User from '@/models/userModel';
import NotificationService from '@/services/notificationService';
import { getDataFromToken } from '@/helper/getDataFromToken';
const EmailService = require('@/lib/sendgrid');

export async function POST(request, { params }) {
  try {
    await connectDB();

    const userId = await getDataFromToken(request);
    if (!userId) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin
    const adminUser = await User.findById(userId);
    if (!adminUser?.isAdmin) {
      return new Response(JSON.stringify({ message: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const announcement = await Announcement.findById(params.id);
    if (!announcement) {
      return new Response(JSON.stringify({ message: 'Announcement not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (announcement.status !== 'draft') {
      return new Response(JSON.stringify({ message: 'Only draft announcements can be sent' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[ANNOUNCEMENT] Sending announcement: ${announcement.title}`);

    // Send emails and notifications to all users
    const sendResults = await sendAnnouncementToUsers(announcement);

    // Update announcement status
    announcement.status = 'sent';
    announcement.sentAt = new Date();
    announcement.recipientCount = sendResults.successCount;
    await announcement.save();

    return new Response(JSON.stringify({
      message: 'Announcement sent successfully',
      announcement,
      stats: {
        total: sendResults.totalUsers,
        emailsSent: sendResults.successCount,
        emailsFailed: sendResults.failedCount,
        notificationsSent: sendResults.notificationsCount
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error sending announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error', error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Send announcement to all users
async function sendAnnouncementToUsers(announcement) {
  const emailService = new EmailService();
  
  // Get all users with valid emails
  const users = await User.find({ 
    email: { $exists: true, $ne: null, $ne: '' }
  }).select('_id name email').lean();

  console.log(`[ANNOUNCEMENT] Sending to ${users.length} users`);

  let successCount = 0;
  let failedCount = 0;
  let notificationsCount = 0;

  // Process in batches to avoid overwhelming the email server
  const batchSize = 10;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (user) => {
      try {
        // Send email
        const emailResult = await emailService.sendAnnouncementEmail(
          user.email,
          user.name || 'Customer',
          {
            title: announcement.title,
            content: announcement.content,
            type: announcement.type || 'update',
            actionUrl: announcement.actionUrl,
            actionText: announcement.actionText || 'Learn More'
          }
        );

        if (emailResult.success) {
          successCount++;
        } else {
          failedCount++;
          console.error(`[ANNOUNCEMENT] Email failed for ${user.email}:`, emailResult.error);
        }

        // Create in-app notification
        try {
          await NotificationService.notifyAnnouncement(user._id, announcement, false);
          notificationsCount++;
        } catch (notifError) {
          console.error(`[ANNOUNCEMENT] Notification failed for ${user._id}:`, notifError.message);
        }

      } catch (error) {
        failedCount++;
        console.error(`[ANNOUNCEMENT] Error sending to ${user.email}:`, error.message);
      }
    }));

    // Add delay between batches to avoid rate limiting
    if (i + batchSize < users.length) {
      await delay(1000); // 1 second delay between batches
    }
  }

  console.log(`[ANNOUNCEMENT] Complete - Success: ${successCount}, Failed: ${failedCount}, Notifications: ${notificationsCount}`);

  return {
    totalUsers: users.length,
    successCount,
    failedCount,
    notificationsCount
  };
}
