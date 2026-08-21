import connectDB from "@/lib/db";
import SupportTicket from "@/models/supportTicketModel";
import EmailService from "@/lib/sendgrid";
import NotificationService from "@/services/notificationService";
import { enforceAdmin } from '@/lib/apiSecurity';
import { markTicketAdminReplyUnreadUpdate } from '@/lib/supportTicketQuery';

const OPEN_STATUSES = ['open', 'in-progress', 'waiting-response'];

async function closeTicketWithAdminMessage(ticket, message, { sendEmail = true } = {}) {
    const previousStatus = ticket.status;
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        throw new Error('Message is required');
    }

    ticket.status = 'closed';
    ticket.updatedAt = new Date();
    Object.assign(ticket, markTicketAdminReplyUnreadUpdate());
    ticket.messages.push({
        author: 'admin',
        authorName: 'Support Team',
        message: trimmed,
        timestamp: new Date(),
        isInternal: false,
    });
    await ticket.save();

    if (sendEmail && ticket.userId?.email) {
        try {
            const emailService = new EmailService();
            await emailService.sendTicketReplyEmail(
                ticket.userId.email,
                ticket.userId.name,
                ticket.ticketId,
                ticket.subject,
                trimmed
            );
            if (previousStatus !== 'closed') {
                await emailService.sendTicketStatusUpdateEmail(
                    ticket.userId.email,
                    ticket.userId.name,
                    ticket.ticketId,
                    ticket.subject,
                    previousStatus,
                    'closed'
                );
            }
        } catch (emailError) {
            console.error(`Bulk close email failed for ${ticket.ticketId}:`, emailError);
        }
    }

    if (ticket.userId?._id) {
        try {
            const userId = ticket.userId._id;
            await NotificationService.notifyTicketReplied(userId, ticket, true);
            if (previousStatus !== 'closed') {
                await NotificationService.notifyTicketStatusChanged(userId, ticket, previousStatus, 'closed');
            }
        } catch (notificationError) {
            console.error(`Bulk close notification failed for ${ticket.ticketId}:`, notificationError);
        }
    }

    return ticket;
}

export async function GET(request) {
    try {
        const denied = await enforceAdmin(request);
        if (denied) return denied;

        await connectDB();

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const search = searchParams.get('search');
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), 500);

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
            // Escaped so a search term like "(((" can't build a catastrophic regex.
            const safe = String(search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { subject: { $regex: safe, $options: 'i' } },
                { ticketId: { $regex: safe, $options: 'i' } },
                { description: { $regex: safe, $options: 'i' } }
            ];
        }

        const tickets = await SupportTicket.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const [open, inProgress, waitingResponse, resolved, closed, closable] = await Promise.all([
            SupportTicket.countDocuments({ status: 'open' }),
            SupportTicket.countDocuments({ status: 'in-progress' }),
            SupportTicket.countDocuments({ status: 'waiting-response' }),
            SupportTicket.countDocuments({ status: 'resolved' }),
            SupportTicket.countDocuments({ status: 'closed' }),
            SupportTicket.countDocuments({ status: { $in: OPEN_STATUSES } }),
        ]);

        return new Response(JSON.stringify({
            tickets,
            summary: {
                total: open + inProgress + waitingResponse + resolved + closed,
                open,
                inProgress,
                waitingResponse,
                resolved,
                closed,
                closable,
            },
        }), {
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

/**
 * POST /api/admin/tickets
 * Bulk close all non-closed tickets with the same admin message.
 */
export async function POST(request) {
    try {
        const denied = await enforceAdmin(request);
        if (denied) return denied;

        await connectDB();

        const body = await request.json();
        const message = String(body.message || '').trim();
        const includeResolved = body.includeResolved === true;
        const onlyOpen = body.onlyOpen !== false;

        if (!message) {
            return new Response(JSON.stringify({ message: 'Closing message is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let statusFilter;
        if (onlyOpen && !includeResolved) {
            statusFilter = { $in: OPEN_STATUSES };
        } else if (includeResolved) {
            statusFilter = { $ne: 'closed' };
        } else {
            statusFilter = { $in: [...OPEN_STATUSES, 'resolved'] };
        }

        const tickets = await SupportTicket.find({ status: statusFilter })
            .populate('userId', 'name email');

        let closed = 0;
        const failed = [];

        for (const ticket of tickets) {
            try {
                await closeTicketWithAdminMessage(ticket, message);
                closed += 1;
            } catch (err) {
                failed.push({ ticketId: ticket.ticketId, error: err.message || 'Failed' });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `${closed} ticket(s) closed`,
            closed,
            failedCount: failed.length,
            failed,
            targeted: tickets.length,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error bulk closing tickets:', error);
        return new Response(JSON.stringify({ message: 'Failed to bulk close tickets', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
