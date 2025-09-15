import connectDB from "@/lib/db";
import SupportTicket from "@/models/supportTicketModel";
import User from "@/models/userModel";
import { getDataFromToken } from "@/helper/getDataFromToken";

function generateTicketId() {
    const timestamp = Date.now().toString(36);
    const randomString = Math.random().toString(36).substring(2, 8);
    return `OCEAN-${timestamp}-${randomString}`.toUpperCase();
}

export async function POST(request) {
    try {
        await connectDB();

        // Get user from token
        const userId = await getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { subject, description, category, priority = 'medium' } = await request.json();

        // Validation
        if (!subject || !description || !category) {
            return new Response(JSON.stringify({ message: 'Subject, description, and category are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ticketId = generateTicketId();

        const ticket = new SupportTicket({
            ticketId,
            userId,
            subject,
            description,
            category,
            priority,
            messages: [{
                author: 'user',
                authorName: user.name,
                message: description,
                timestamp: new Date()
            }]
        });

        await ticket.save();

        return new Response(JSON.stringify({
            message: 'Support ticket created successfully',
            ticket: {
                ticketId: ticket.ticketId,
                subject: ticket.subject,
                status: ticket.status,
                createdAt: ticket.createdAt
            }
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error creating support ticket:', error);
        return new Response(JSON.stringify({ message: 'Failed to create support ticket', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function GET(request) {
    try {
        await connectDB();

        // Get user from token
        const userId = await getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const tickets = await SupportTicket.find({ userId })
            .select('ticketId subject category priority status createdAt updatedAt')
            .sort({ createdAt: -1 })
            .lean();

        return new Response(JSON.stringify(tickets), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching support tickets:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch support tickets', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
