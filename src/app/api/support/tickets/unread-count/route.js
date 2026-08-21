import connectDB from '@/lib/db';
import SupportTicket from '@/models/supportTicketModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { buildUserTicketFilter } from '@/lib/supportTicketQuery';

/** GET /api/support/tickets/unread-count — admin replies the user has not opened yet. */
export async function GET(request) {
  try {
    await connectDB();

    const userId = await getDataFromToken(request);
    if (!userId) {
      return new Response(JSON.stringify({ message: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const count = await SupportTicket.countDocuments({
      ...buildUserTicketFilter(userId),
      hasUnreadAdminReply: true,
    });

    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching unread ticket count:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to fetch unread ticket count', error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
