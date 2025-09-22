import connectDB from "../../../../lib/db";
import User from '../../../../models/userModel'
import Order from '../../../../models/orderModel'
import { getDataFromToken } from '../../../../helper/getDataFromToken'

export async function GET(request) {
    try {
        // Ensure DB is connected
        await connectDB();

        // Extract user ID from JWT in the Authorization header
        const userId = await getDataFromToken(request);

        // Find user by ID
        const user = await User.findOne({ _id: userId }).lean();
        if (!user) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Get user's orders for statistics
        const orders = await Order.find({ user: userId }).lean();

        // Calculate real statistics
        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, order) => sum + (order.price || 0), 0);

        // Calculate total from renewal payments as well
        const renewalSpent = orders.reduce((sum, order) => {
            if (order.renewalPayments && order.renewalPayments.length > 0) {
                return sum + order.renewalPayments.reduce((renewalSum, renewal) => renewalSum + (renewal.amount || 0), 0);
            }
            return sum;
        }, 0);

        const totalSpentIncludingRenewals = totalSpent + renewalSpent;

        // Calculate account age
        const accountCreated = new Date(user.createdAt || user._id.getTimestamp());
        const accountAge = Math.floor((new Date() - accountCreated) / (1000 * 60 * 60 * 24));

        // Get recent orders for activity
        const recentOrders = orders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        // Count orders by status
        const ordersByStatus = {
            completed: orders.filter(order => order.status === 'completed').length,
            pending: orders.filter(order => order.status === 'pending' || order.status === 'confirmed').length,
            failed: orders.filter(order => order.status === 'failed').length,
            active: orders.filter(order => order.provisioningStatus === 'active').length
        };

        // Calculate average order value
        const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

        // Get last login (this would typically be tracked separately)
        const lastLogin = new Date(); // For now, use current time

        // Enhanced user object with real statistics
        const userWithStats = {
            ...user,
            stats: {
                totalOrders,
                totalSpent,
                totalSpentIncludingRenewals,
                renewalSpent,
                accountAge,
                lastLogin,
                averageOrderValue,
                ordersByStatus,
                recentOrders: recentOrders.map(order => ({
                    _id: order._id,
                    productName: order.productName,
                    price: order.price,
                    status: order.status,
                    createdAt: order.createdAt,
                    provisioningStatus: order.provisioningStatus
                }))
            }
        };

        // Return user data with real statistics
        return new Response(JSON.stringify(userWithStats), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch user data', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
