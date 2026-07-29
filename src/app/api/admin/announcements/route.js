import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import { broadcastAnnouncement } from '@/lib/announcementBroadcast';
import { enforceAdmin } from '@/lib/apiSecurity';
import { requireAdmin } from '@/lib/adminAuth';
import {
  normalizeOrderPopupFields,
  prepareOrderPopupCreate,
} from '@/lib/announcementOrderPopup';

export async function GET(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    let announcements;
    try {
      announcements = await Announcement.find()
        .populate('targetCompany', 'name slug')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    } catch (populateErr) {
      console.warn('[announcements] populate failed, returning without company names:', populateErr.message);
      announcements = await Announcement.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    }

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
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const adminUser = await requireAdmin(request);

    const {
      title,
      content,
      type,
      status,
      targetAudience,
      actionUrl,
      actionText,
      scheduledFor,
      showAsLoginPopup,
      communityLink,
      showOnOrderPage,
      targetProvider,
      targetCompany,
    } = await request.json();

    if (!title || !content) {
      return new Response(JSON.stringify({ message: 'Title and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const orderPopupFields = normalizeOrderPopupFields({
      showOnOrderPage,
      targetProvider,
      targetCompany,
    });
    if (orderPopupFields.error) {
      return new Response(JSON.stringify({ message: orderPopupFields.error }), {
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
      showAsLoginPopup: Boolean(showAsLoginPopup),
      communityLink: communityLink || '',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      createdBy: adminUser._id,
      ...orderPopupFields,
    });

    await announcement.save();

    let broadcastStats = null;

    // If status is 'sent', send emails/notifications only for normal announcements.
    // Login popup announcements are published without broadcasting.
    if (status === 'sent') {
      if (announcement.showAsLoginPopup || announcement.showOnOrderPage) {
        await prepareOrderPopupCreate(announcement, 'sent');
        announcement.status = 'sent';
        await announcement.save();
      } else {
        broadcastStats = await broadcastAnnouncement(announcement);
        announcement.status = 'sent';
        announcement.sentCount = broadcastStats.emailsSent;
        announcement.emailsFailed = broadcastStats.emailsFailed;
        announcement.notificationCount = broadcastStats.notificationsSent;
        announcement.sentAt = new Date();
        await announcement.save();
      }
    }

    const responseMessage =
      status === 'sent' && announcement.showAsLoginPopup
        ? 'Login popup published successfully'
        : status === 'sent' && announcement.showOnOrderPage
          ? 'Manage order news published successfully'
          : broadcastStats
            ? `Announcement sent — ${broadcastStats.emailsSent} emails, ${broadcastStats.notificationsSent} notifications`
            : 'Announcement created successfully';

    return new Response(JSON.stringify({
      message: responseMessage,
      announcement,
      stats: broadcastStats,
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
