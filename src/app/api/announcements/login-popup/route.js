import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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

    const user = await User.findById(userId).select('_id createdAt').lean();
    if (!user) {
      return new Response(JSON.stringify({ message: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const latestPopupAnnouncement = await Announcement.findOne({
      status: 'sent',
      showAsLoginPopup: true
    })
      .sort({ sentAt: -1, createdAt: -1 })
      .lean();

    if (!latestPopupAnnouncement) {
      return new Response(JSON.stringify({ popup: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let shouldShow = false;
    const audience = latestPopupAnnouncement.targetAudience || 'all';

    if (audience === 'all') {
      shouldShow = true;
    } else if (audience === 'customers') {
      const hasOrders = await Order.exists({ user: userId });
      shouldShow = Boolean(hasOrders);
    } else if (audience === 'new-users') {
      const createdAt = new Date(user.createdAt || Date.now());
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      shouldShow = createdAt >= thirtyDaysAgo;
    } else if (audience === 'premium') {
      // Premium audience logic can be refined later.
      shouldShow = true;
    }

    if (!shouldShow) {
      return new Response(JSON.stringify({ popup: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const popup = {
      _id: latestPopupAnnouncement._id,
      title: latestPopupAnnouncement.title,
      content: latestPopupAnnouncement.content,
      communityLink: isValidHttpUrl(latestPopupAnnouncement.communityLink)
        ? latestPopupAnnouncement.communityLink
        : '',
      actionText: latestPopupAnnouncement.actionText || '',
      actionUrl: isValidHttpUrl(latestPopupAnnouncement.actionUrl)
        ? latestPopupAnnouncement.actionUrl
        : ''
    };

    return new Response(JSON.stringify({ popup }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching login popup announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
