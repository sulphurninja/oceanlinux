import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
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

    // Get aggregate stats
    const stats = await Announcement.aggregate([
      {
        $match: {
          status: 'sent'
        }
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: '$sentCount' },
          totalOpened: { $sum: '$openCount' },
          totalClicked: { $sum: '$clickCount' },
          announcements: { $sum: 1 }
        }
      }
    ]);

    const result = stats[0] || {
      totalSent: 0,
      totalOpened: 0,
      totalClicked: 0,
      announcements: 0
    };

    // Calculate average open rate
    result.averageOpenRate = result.totalSent > 0
      ? (result.totalOpened / result.totalSent) * 100
      : 0;

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching announcement stats:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
