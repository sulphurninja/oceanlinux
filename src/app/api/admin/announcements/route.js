import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import User from '@/models/userModel';
import EmailService from '@/lib/sendgrid';
import NotificationService from '@/services/notificationService'; // Add this import
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function GET(request) {
  try {
    await connectDB();

    const userId = await getDataFromToken(request);
    if (!userId) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin (you might want to add admin check logic here)
    const user = await User.findById(userId);
    if (!user) {
      return new Response(JSON.stringify({ message: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .limit(50);

    return new Response(JSON.stringify(announcements), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching announcements:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(request) {
  try {
    await connectDB();

    const userId = await getDataFromToken(request);
    if (!userId) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const {
      title,
      content,
      type,
      status,
      targetAudience,
      actionUrl,
      actionText,
      scheduledFor
    } = await request.json();

    if (!title || !content) {
      return new Response(JSON.stringify({ message: 'Title and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const announcement = new Announcement({
      title,
      content,
      type: type || 'update',
      status: status || 'draft',
      targetAudience: targetAudience || 'all',
      actionUrl,
      actionText,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      createdBy: userId
    });

    await announcement.save();

    // If status is 'sent', send emails and notifications immediately
    if (status === 'sent') {
      await sendAnnouncementEmails(announcement);
      await sendAnnouncementNotifications(announcement); // Add this line
    }

    return new Response(JSON.stringify({
      message: 'Announcement created successfully',
      announcement
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function to send announcement emails (existing)
async function sendAnnouncementEmails(announcement) {
  try {
    // Get target users based on audience
    let users = [];

    switch (announcement.targetAudience) {
      case 'all':
        users = await User.find().select('email name');
        break;
      case 'customers':
        // Get users who have orders
        const Order = require('@/models/orderModel').default;
        const customerIds = await Order.distinct('user');
        users = await User.find({ _id: { $in: customerIds } }).select('email name');
        break;
      case 'new-users':
        // Users created in last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        users = await User.find({ createdAt: { $gte: thirtyDaysAgo } }).select('email name');
        break;
      case 'premium':
        // Define your premium user logic here
        users = await User.find().select('email name'); // Placeholder
        break;
      default:
        users = await User.find().select('email name');
    }

    const emailService = new EmailService();
    let sentCount = 0;

    // Send emails in batches to avoid overwhelming the email service
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (user) => {
          try {
            await emailService.sendAnnouncementEmail(user.email, user.name, {
              title: announcement.title,
              content: announcement.content,
              type: announcement.type,
              subject: announcement.title,
              actionUrl: announcement.actionUrl,
              actionText: announcement.actionText
            });
            sentCount++;
          } catch (error) {
            console.error(`Failed to send email to ${user.email}:`, error);
          }
        })
      );

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update announcement with sent info
    announcement.status = 'sent';
    announcement.sentCount = sentCount;
    announcement.sentAt = new Date();
    await announcement.save();

    console.log(`Announcement emails sent to ${sentCount} users`);
  } catch (error) {
    console.error('Error sending announcement emails:', error);
    throw error;
  }
}

// NEW: Helper function to send announcement notifications
async function sendAnnouncementNotifications(announcement) {
  try {
    // Get target users based on audience (same logic as emails)
    let users = [];

    switch (announcement.targetAudience) {
      case 'all':
        users = await User.find().select('_id');
        break;
      case 'customers':
        // Get users who have orders
        const Order = require('@/models/orderModel').default;
        const customerIds = await Order.distinct('user');
        users = await User.find({ _id: { $in: customerIds } }).select('_id');
        break;
      case 'new-users':
        // Users created in last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        users = await User.find({ createdAt: { $gte: thirtyDaysAgo } }).select('_id');
        break;
      case 'premium':
        // Define your premium user logic here
        users = await User.find().select('_id'); // Placeholder
        break;
      default:
        users = await User.find().select('_id');
    }

    let notificationCount = 0;

    // Create notifications in batches
    const batchSize = 100;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const notificationPromises = batch.map(async (user) => {
        try {
          await NotificationService.notifyAnnouncement(user._id, announcement);
          notificationCount++;
        } catch (error) {
          console.error(`Failed to create notification for user ${user._id}:`, error);
        }
      });

      await Promise.allSettled(notificationPromises);

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Announcement notifications created for ${notificationCount} users`);
  } catch (error) {
    console.error('Error sending announcement notifications:', error);
    throw error;
  }
}
