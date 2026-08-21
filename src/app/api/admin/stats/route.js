import connectDB from "@/lib/db";
import User from "@/models/userModel";
import SupportTicket from "@/models/supportTicketModel";
import KnowledgeBase from "@/models/knowledgeBaseModel";
import Order from "@/models/orderModel";
import { enforceAdmin } from '@/lib/apiSecurity';

export async function GET(request) {
    try {
        const denied = await enforceAdmin(request);
        if (denied) return denied;

        await connectDB();

        // Get user stats
        const totalUsers = await User.countDocuments();
        const newUsersThisMonth = await User.countDocuments({
            createdAt: { $gte: new Date(new Date().setDate(1)) }
        });

        // Get ticket stats
        const totalTickets = await SupportTicket.countDocuments();
        const openTickets = await SupportTicket.countDocuments({ status: 'open' });
        const inProgressTickets = await SupportTicket.countDocuments({ status: 'in-progress' });
        const waitingResponseTickets = await SupportTicket.countDocuments({ status: 'waiting-response' });
        const resolvedTickets = await SupportTicket.countDocuments({ status: 'resolved' });

        // Get knowledge base stats
        const totalArticles = await KnowledgeBase.countDocuments();
        const publishedArticles = await KnowledgeBase.countDocuments({ published: true });
        const newArticlesThisMonth = await KnowledgeBase.countDocuments({
            createdAt: { $gte: new Date(new Date().setDate(1)) }
        });

        // Recent tickets
        const recentTickets = await SupportTicket.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const [
            totalOrders,
            pendingOrders,
            confirmedOrders,
            activeOrders,
            provisioningNow,
            provisionFailed,
            paidNotProvisioned,
            advpsPending,
        ] = await Promise.all([
            Order.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'confirmed' }),
            Order.countDocuments({ status: 'active' }),
            Order.countDocuments({ provisioningStatus: { $in: ['provisioning', 'in_progress'] } }),
            Order.countDocuments({ provisioningStatus: 'failed' }),
            Order.countDocuments({
                status: 'confirmed',
                ipAddress: { $in: [null, ''] },
                provisioningStatus: { $nin: ['completed', 'active'] },
            }),
            Order.countDocuments({
                status: 'confirmed',
                provisioningStatus: 'provisioning',
                provisioningError: { $regex: /^ADVPS_PENDING/ },
            }),
        ]);

        const stats = {
            users: {
                total: totalUsers,
                newThisMonth: newUsersThisMonth
            },
            tickets: {
                total: totalTickets,
                open: openTickets,
                inProgress: inProgressTickets,
                waitingResponse: waitingResponseTickets,
                resolved: resolvedTickets,
                recent: recentTickets
            },
            knowledgeBase: {
                total: totalArticles,
                published: publishedArticles,
                newThisMonth: newArticlesThisMonth
            },
            systemHealth: {
                uptime: "99.98%",
                responseTime: "245ms",
                status: provisionFailed > 5 ? "degraded" : "operational",
                cronSecretConfigured: !!process.env.CRON_SECRET,
            },
            orders: {
                total: totalOrders,
                pending: pendingOrders,
                confirmed: confirmedOrders,
                active: activeOrders,
                provisioningNow,
                provisionFailed,
                paidNotProvisioned,
                advpsPending,
            }
        };

        return new Response(JSON.stringify(stats), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch stats', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
