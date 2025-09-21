import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function DELETE(request, { params }) {
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

    await Announcement.findByIdAndDelete(params.id);

    return new Response(JSON.stringify({
      message: 'Announcement deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting announcement:', error);
    return new Response(JSON.stringify({ message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
