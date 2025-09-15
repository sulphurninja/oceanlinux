import connectDB from "@/lib/db";
import User from "@/models/userModel";
import SupportTicket from "@/models/supportTicketModel";
import KnowledgeBase from "@/models/knowledgeBaseModel";

export async function GET(request) {
    try {
        await connectDB();

        // TODO: Add admin authentication check here

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
                status: "operational"
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
