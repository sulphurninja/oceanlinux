import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import SupportTicket from '@/models/supportTicketModel';
import Notification from '@/models/notificationModel';
import User from '@/models/userModel';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 50;
        const type = searchParams.get('type');
        const status = searchParams.get('status');
        const category = searchParams.get('category');
        const search = searchParams.get('search');
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const isExport = searchParams.get('export') === 'true';

        // Collect activities from different sources
        const activities = [];

        // Date filter setup
        const dateFilter = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) dateFilter.$lte = new Date(dateTo);

        // Get orders
        if (!type || type === 'all' || type.startsWith('order_') || type.startsWith('payment_') || !category || category === 'all' || category === 'orders') {
            const orderQuery = { user: userId };
            if (dateFrom || dateTo) orderQuery.createdAt = dateFilter;

            const orders = await Order.find(orderQuery)
                .sort({ createdAt: -1 })
                .limit(isExport ? 10000 : 200)
                .lean();

            orders.forEach(order => {
                // Order created activity
                const orderActivity = {
                    _id: `order-${order._id}`,
                    type: 'order_created',
                    title: 'Order Created',
                    description: `Created order for ${order.productName} - ₹${order.price}`,
                    timestamp: order.createdAt,
                    status: 'success',
                    category: 'orders',
                    metadata: {
                        orderId: order._id,
                        productName: order.productName,
                        amount: order.price,
                        clickable: true
                    }
                };

                // Payment activity if confirmed
                if (order.status === 'confirmed' || order.status === 'completed') {
                    const paymentActivity = {
                        _id: `payment-${order._id}`,
                        type: 'payment_success',
                        title: 'Payment Successful',
                        description: `Payment of ₹${order.price} completed for ${order.productName}`,
                        timestamp: order.updatedAt,
                        status: 'success',
                        category: 'orders',
                        metadata: {
                            orderId: order._id,
                            amount: order.price,
                            transactionId: order.transactionId,
                            clickable: true
                        }
                    };
                    activities.push(paymentActivity);
                }

                // Order completion activity
                if (order.status === 'completed') {
                    const completionActivity = {
                        _id: `order-completed-${order._id}`,
                        type: 'order_completed',
                        title: 'Order Completed',
                        description: `Server deployment completed for ${order.productName}`,
                        timestamp: order.updatedAt,
                        status: 'success',
                        category: 'orders',
                        metadata: {
                            orderId: order._id,
                            productName: order.productName,
                            clickable: true
                        }
                    };
                    activities.push(completionActivity);
                }

                activities.push(orderActivity);
            });
        }

        // Get support tickets
        if (!type || type === 'all' || type.startsWith('ticket_') || !category || category === 'all' || category === 'support') {
            const ticketQuery = { userId };
            if (dateFrom || dateTo) ticketQuery.createdAt = dateFilter;

            const tickets = await SupportTicket.find(ticketQuery)
                .sort({ createdAt: -1 })
                .limit(isExport ? 10000 : 100)
                .lean();

            tickets.forEach(ticket => {
                // Ticket created activity
                const ticketActivity = {
                    _id: `ticket-${ticket._id}`,
                    type: 'ticket_created',
                    title: 'Support Ticket Created',
                    description: `Created ticket: ${ticket.subject} (${ticket.category})`,
                    timestamp: ticket.createdAt,
                    status: ticket.status === 'resolved' ? 'success' : 'pending',
                    category: 'support',
                    metadata: {
                        ticketId: ticket.ticketId,
                        subject: ticket.subject,
                        category: ticket.category,
                        clickable: true
                    }
                };

                activities.push(ticketActivity);

                // Add activities for admin replies
                const adminReplies = ticket.messages.filter(msg => msg.author === 'admin');
                adminReplies.forEach(reply => {
                    activities.push({
                        _id: `ticket-reply-${ticket._id}-${reply.timestamp}`,
                        type: 'ticket_replied',
                        title: 'Support Team Replied',
                        description: `Reply received for "${ticket.subject}"`,
                        timestamp: reply.timestamp,
                        status: 'success',
                        category: 'support',
                        metadata: {
                            ticketId: ticket.ticketId,
                            subject: ticket.subject,
                            clickable: true
                        }
                    });
                });

                // Ticket resolution activity
                if (ticket.status === 'resolved' && ticket.resolvedAt) {
                    activities.push({
                        _id: `ticket-resolved-${ticket._id}`,
                        type: 'ticket_resolved',
                        title: 'Ticket Resolved',
                        description: `Support ticket "${ticket.subject}" has been resolved`,
                        timestamp: ticket.resolvedAt,
                        status: 'success',
                        category: 'support',
                        metadata: {
                            ticketId: ticket.ticketId,
                            subject: ticket.subject,
                            clickable: true
                        }
                    });
                }
            });
        }

        // Get user profile updates
        if (!type || type === 'all' || type === 'profile_updated' || !category || category === 'all' || category === 'account') {
            const user = await User.findById(userId).lean();
            if (user && user.updatedAt && user.updatedAt > user.createdAt) {
                const profileActivity = {
                    _id: `profile-${user._id}`,
                    type: 'profile_updated',
                    title: 'Profile Updated',
                    description: 'Your profile information was updated',
                    timestamp: user.updatedAt,
                    status: 'success',
                    category: 'account',
                    metadata: {
                        clickable: true
                    }
                };

                // Only add if it matches date filter
                if (!dateFrom && !dateTo ||
                    (new Date(profileActivity.timestamp) >= new Date(dateFrom || '1970-01-01') &&
                     new Date(profileActivity.timestamp) <= new Date(dateTo || '2099-12-31'))) {
                    activities.push(profileActivity);
                }
            }

            // Add account creation activity
            const accountCreatedActivity = {
                _id: `account-created-${user._id}`,
                type: 'account_created',
                title: 'Account Created',
                description: 'Welcome to OceanLinux! Your account was successfully created.',
                timestamp: user.createdAt,
                status: 'success',
                category: 'account',
                metadata: {
                    clickable: false
                }
            };

            if (!dateFrom && !dateTo ||
                (new Date(accountCreatedActivity.timestamp) >= new Date(dateFrom || '1970-01-01') &&
                 new Date(accountCreatedActivity.timestamp) <= new Date(dateTo || '2099-12-31'))) {
                activities.push(accountCreatedActivity);
            }
        }

        // Get recent notifications for system activities
        if (!type || type === 'all' || type === 'notification' || !category || category === 'all' || category === 'system') {
            const notificationQuery = { userId };
            if (dateFrom || dateTo) notificationQuery.createdAt = dateFilter;

            const notifications = await Notification.find(notificationQuery)
                .sort({ createdAt: -1 })
                .limit(50)
                .lean();

            notifications.forEach(notif => {
                if (notif.type === 'announcement' || notif.type === 'system_update') {
                    activities.push({
                        _id: `notification-${notif._id}`,
                        type: 'notification',
                        title: notif.title,
                        description: notif.message,
                        timestamp: notif.createdAt,
                        status: 'success',
                        category: 'system',
                        metadata: {
                            notificationId: notif._id,
                            clickable: false
                        }
                    });
                }
            });
        }

        // Apply filters
        let filteredActivities = activities;

        // Type filter
        if (type && type !== 'all') {
            filteredActivities = filteredActivities.filter(activity => activity.type === type);
        }

        // Status filter
        if (status && status !== 'all') {
            filteredActivities = filteredActivities.filter(activity => activity.status === status);
        }

        // Category filter
        if (category && category !== 'all') {
            filteredActivities = filteredActivities.filter(activity => activity.category === category);
        }

        // Search filter
        if (search) {
            const searchTerm = search.toLowerCase();
            filteredActivities = filteredActivities.filter(activity =>
                activity.title.toLowerCase().includes(searchTerm) ||
                activity.description.toLowerCase().includes(searchTerm) ||
                (activity.metadata?.productName && activity.metadata.productName.toLowerCase().includes(searchTerm)) ||
                (activity.metadata?.subject && activity.metadata.subject.toLowerCase().includes(searchTerm))
            );
        }

        // Sort by timestamp
        filteredActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // If export, return all filtered activities
        if (isExport) {
            return NextResponse.json({
                activities: filteredActivities,
                total: filteredActivities.length
            });
        }

        // Apply pagination
        const total = filteredActivities.length;
        const paginatedActivities = filteredActivities.slice((page - 1) * limit, page * limit);

        return NextResponse.json({
            activities: paginatedActivities,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching user activity:', error);
        return NextResponse.json(
            { message: 'Failed to fetch activity', error: error.message },
            { status: 500 }
        );
    }
}
