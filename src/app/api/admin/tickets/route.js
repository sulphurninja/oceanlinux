import connectDB from "@/lib/db";
import SupportTicket from "@/models/supportTicketModel";
import { enforceAdmin } from '@/lib/apiSecurity';

export async function GET(request) {
    try {
        const denied = await enforceAdmin(request);
        if (denied) return denied;

        await connectDB();

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const search = searchParams.get('search');

        let query = {};

        // Filter by status
        if (status && status !== 'all') {
            query.status = status;
        }

        // Filter by priority
        if (priority && priority !== 'all') {
            query.priority = priority;
        }

        // Search functionality
        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: 'i' } },
                { ticketId: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const tickets = await SupportTicket.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        return new Response(JSON.stringify(tickets), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching admin tickets:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch tickets', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
