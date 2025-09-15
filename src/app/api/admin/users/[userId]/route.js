import connectDB from "@/lib/db";
import User from "@/models/userModel";
import Order from "@/models/orderModel";
import { getDataFromToken } from "@/helper/getDataFromToken";

export async function GET(request, { params }) {
    try {
        await connectDB();

        // Check if user is admin
        const adminId = getDataFromToken(request);
        if (!adminId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const user = await User.findById(params.userId).select('-password').lean();
        if (!user) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Get user's orders with detailed information
        const orders = await Order.find({ user: params.userId })
            .sort({ createdAt: -1 })
            .lean();

        // Calculate user statistics
        const stats = {
            totalOrders: orders.length,
            totalSpent: orders.reduce((sum, order) => sum + (order.price || 0), 0),
            activeServices: orders.filter(order =>
                order.status === 'completed' ||
                order.provisioningStatus === 'active'
            ).length,
            pendingOrders: orders.filter(order => order.status === 'pending').length,
            failedOrders: orders.filter(order =>
                order.status === 'failed' ||
                order.provisioningStatus === 'failed'
            ).length,
            lastOrderDate: orders.length > 0 ? orders[0].createdAt : null,
            avgOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + (order.price || 0), 0) / orders.length : 0
        };

        return new Response(JSON.stringify({
            user,
            orders,
            stats
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching user details:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch user details', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
