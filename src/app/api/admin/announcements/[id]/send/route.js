import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import User from '@/models/userModel';
import EmailService from '@/lib/sendgrid';
import NotificationService from '@/services/notificationService';
import { getDataFromToken } from '@/helper/getDataFromToken';

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

    // Send emails and notifications
    await sendAnnouncementEmails(announcement);
    await sendAnnouncementNotifications(announcement);

    return new Response(JSON.stringify({
      message: 'Announcement sent successfully',
      announcement
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error sending announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Copy the helper functions from the main route file
async function sendAnnouncementEmails(announcement) {
  // ... same implementation as above
}

async function sendAnnouncementNotifications(announcement) {
  // ... same implementation as above
}
