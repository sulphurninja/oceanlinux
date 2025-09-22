import connectDB from "@/lib/db";
import SupportTicket from "@/models/supportTicketModel";
import User from "@/models/userModel";
import { getDataFromToken } from "@/helper/getDataFromToken";
import NotificationService from '@/services/notificationService'; // Add this import

export async function GET(request, { params }) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ticket = await SupportTicket.findOne({
            ticketId: params.ticketId,
            userId
        }).lean();

        if (!ticket) {
            return new Response(JSON.stringify({ message: 'Ticket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify(ticket), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching support ticket:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch support ticket', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function POST(request, { params }) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const user = await User.findById(userId);
        const { message } = await request.json();

        if (!message) {
            return new Response(JSON.stringify({ message: 'Message is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ticket = await SupportTicket.findOneAndUpdate(
            { ticketId: params.ticketId, userId },
            {
                $push: {
                    messages: {
                        author: 'user',
                        authorName: user.name,
                        message,
                        timestamp: new Date()
                    }
                },
                $set: {
                    status: 'waiting-response',
                    updatedAt: new Date()
                }
            },
            { new: true }
        );

        if (!ticket) {
            return new Response(JSON.stringify({ message: 'Ticket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Create notification for user reply
        try {
            await NotificationService.notifyTicketReplied(userId, ticket, false); // false = not from admin
        } catch (notifError) {
            console.error('Failed to create ticket reply notification:', notifError);
        }


        return new Response(JSON.stringify({ message: 'Reply added successfully' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error replying to support ticket:', error);
        return new Response(JSON.stringify({ message: 'Failed to reply to support ticket', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
