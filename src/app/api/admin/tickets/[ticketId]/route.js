import connectDB from "@/lib/db";
import SupportTicket from "@/models/supportTicketModel";
import { getDataFromToken } from "@/helper/getDataFromToken";

export async function GET(request, { params }) {
    try {
        await connectDB();

        // Check if user is admin
        const userId = getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const ticket = await SupportTicket.findOne({
            ticketId: params.ticketId
        }).populate('userId', 'name email').lean();

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
        console.error('Error fetching admin ticket:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch ticket', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function PATCH(request, { params }) {
    try {
        await connectDB();

        // Check if user is admin
        const userId = getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { status, assignedTo, tags, adminReply } = await request.json();

        const updateData = {};
        if (status) updateData.status = status;
        if (assignedTo) updateData.assignedTo = assignedTo;
        if (tags) updateData.tags = tags;
        updateData.updatedAt = new Date();

        // Add admin reply if provided
        if (adminReply) {
            updateData.$push = {
                messages: {
                    author: 'admin',
                    authorName: 'Support Team',
                    message: adminReply,
                    timestamp: new Date()
                }
            };
        }

        const ticket = await SupportTicket.findOneAndUpdate(
            { ticketId: params.ticketId },
            updateData,
            { new: true }
        ).populate('userId', 'name email');

        if (!ticket) {
            return new Response(JSON.stringify({ message: 'Ticket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Send ticket update email
        try {
            const emailService = new EmailService();
            await emailService.sendTicketUpdateEmail(
                user.email,
                user.name,
                ticket.ticketId,
                ticket.subject,
                ticket.status,
                message
            );
        } catch (emailError) {
            console.error('Ticket update email failed:', emailError);
        }
        return new Response(JSON.stringify({
            message: 'Ticket updated successfully',
            ticket
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error updating admin ticket:', error);
        return new Response(JSON.stringify({ message: 'Failed to update ticket', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
