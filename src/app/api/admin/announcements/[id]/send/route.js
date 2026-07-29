import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import { broadcastAnnouncement } from '@/lib/announcementBroadcast';
import { enforceAdmin } from '@/lib/apiSecurity';

export async function POST(request, { params }) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const announcement = await Announcement.findById(params.id);
    if (!announcement) {
      return new Response(JSON.stringify({ message: 'Announcement not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (announcement.status !== 'draft') {
      return new Response(JSON.stringify({ message: 'Only draft announcements can be sent' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Login popup announcements should be published without broadcast email/notification.
    if (announcement.showAsLoginPopup) {
      announcement.status = 'sent';
      announcement.sentAt = new Date();
      await announcement.save();

      return new Response(JSON.stringify({
        message: 'Login popup published successfully',
        announcement,
        stats: {
          total: 0,
          emailsSent: 0,
          emailsFailed: 0,
          notificationsSent: 0,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ANNOUNCEMENT] Sending announcement: ${announcement.title}`);

    const sendResults = await broadcastAnnouncement(announcement);

    announcement.status = 'sent';
    announcement.sentAt = new Date();
    announcement.sentCount = sendResults.emailsSent;
    await announcement.save();

    return new Response(JSON.stringify({
      message: `Announcement sent — ${sendResults.emailsSent} emails, ${sendResults.notificationsSent} notifications`,
      announcement,
      stats: {
        total: sendResults.totalUsers,
        emailsSent: sendResults.emailsSent,
        emailsFailed: sendResults.emailsFailed,
        notificationsSent: sendResults.notificationsSent,
        notificationsFailed: sendResults.notificationsFailed,
        sampleErrors: sendResults.sampleErrors,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error', error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
