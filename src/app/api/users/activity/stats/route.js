import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import SupportTicket from '@/models/supportTicketModel';
import User from '@/models/userModel';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get order stats
        const totalOrders = await Order.countDocuments({ user: userId });
        const ordersToday = await Order.countDocuments({
            user: userId,
            createdAt: { $gte: today }
        });
        const ordersThisWeek = await Order.countDocuments({
            user: userId,
            createdAt: { $gte: thisWeek }
        });
        const ordersThisMonth = await Order.countDocuments({
            user: userId,
            createdAt: { $gte: thisMonth }
        });

        // Get ticket stats
        const totalTickets = await SupportTicket.countDocuments({ userId });
        const ticketsToday = await SupportTicket.countDocuments({
            userId,
            createdAt: { $gte: today }
        });
        const ticketsThisWeek = await SupportTicket.countDocuments({
            userId,
            createdAt: { $gte: thisWeek }
        });
        const ticketsThisMonth = await SupportTicket.countDocuments({
            userId,
            createdAt: { $gte: thisMonth }
        });

        // Calculate success rates
        const successfulOrders = await Order.countDocuments({
            user: userId,
            status: { $in: ['confirmed', 'completed'] }
        });
        const resolvedTickets = await SupportTicket.countDocuments({
            userId,
            status: 'resolved'
        });

        const totalActivities = totalOrders + totalTickets + 2; // +2 for profile updates
        const successfulActivities = successfulOrders + resolvedTickets + 2;
        const successRate = totalActivities > 0 ? Math.round((successfulActivities / totalActivities) * 100) : 100;

        return NextResponse.json({
            total: totalActivities,
            today: ordersToday + ticketsToday,
            thisWeek: ordersThisWeek + ticketsThisWeek,
            thisMonth: ordersThisMonth + ticketsThisMonth,
            successRate,
            breakdown: {
                orders: {
                    total: totalOrders,
                    today: ordersToday,
                    thisWeek: ordersThisWeek,
                    thisMonth: ordersThisMonth,
                    successful: successfulOrders
                },
                tickets: {
                    total: totalTickets,
                    today: ticketsToday,
                    thisWeek: ticketsThisWeek,
                    thisMonth: ticketsThisMonth,
                    resolved: resolvedTickets
                }
            }
        });

    } catch (error) {
        console.error('Error fetching activity stats:', error);
        return NextResponse.json(
            { message: 'Failed to fetch activity stats', error: error.message },
            { status: 500 }
        );
    }
}
