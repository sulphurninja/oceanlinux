import connectDB from "@/lib/db";
import SupportTicket from "@/models/supportTicketModel";
import User from "@/models/userModel";
import EmailService from "@/lib/sendgrid";
import NotificationService from "@/services/notificationService"; // Add this import
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
        const adminUserId = getDataFromToken(request);
        if (!adminUserId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { status, assignedTo, tags, adminReply } = await request.json();

        // First, get the current ticket to compare status changes
        const currentTicket = await SupportTicket.findOne({ ticketId: params.ticketId })
            .populate('userId', 'name email');

        if (!currentTicket) {
            return new Response(JSON.stringify({ message: 'Ticket not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const updateData = {};
        const previousStatus = currentTicket.status;

        if (status) updateData.status = status;
        if (assignedTo) updateData.assignedTo = assignedTo;
        if (tags) updateData.tags = tags;
        updateData.updatedAt = new Date();

        // Set resolved date if status is being changed to resolved
        if (status === 'resolved' && previousStatus !== 'resolved') {
            updateData.resolvedAt = new Date();
        }

        // Add admin reply if provided
        if (adminReply) {
            updateData.$push = {
                messages: {
                    author: 'admin',
                    authorName: 'Support Team',
                    message: adminReply,
                    timestamp: new Date(),
                    isInternal: false
                }
            };
        }

        const ticket = await SupportTicket.findOneAndUpdate(
            { ticketId: params.ticketId },
            updateData,
            { new: true }
        ).populate('userId', 'name email');

        // Send email notification
        try {
            const emailService = new EmailService();

            if (adminReply) {
                await emailService.sendTicketReplyEmail(
                    ticket.userId.email,
                    ticket.userId.name,
                    ticket.ticketId,
                    ticket.subject,
                    adminReply
                );
            }

            if (status && status !== previousStatus) {
                await emailService.sendTicketStatusUpdateEmail(
                    ticket.userId.email,
                    ticket.userId.name,
                    ticket.ticketId,
                    ticket.subject,
                    previousStatus,
                    status
                );
            }
        } catch (emailError) {
            console.error('Ticket email notification failed:', emailError);
        }

        // Send in-app notifications
        try {
            const userId = ticket.userId._id;

            // Send notification for admin reply
            if (adminReply) {
                await NotificationService.notifyTicketReplied(userId, ticket, true); // true = from admin
            }

            // Send notification for status change
            if (status && status !== previousStatus) {
                await NotificationService.notifyTicketStatusChanged(userId, ticket, previousStatus, status);
            }

            // Send special notification for resolved tickets
            if (status === 'resolved' && previousStatus !== 'resolved') {
                await NotificationService.notifyTicketResolved(userId, ticket);
            }

        } catch (notificationError) {
            console.error('Ticket notification failed:', notificationError);
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
