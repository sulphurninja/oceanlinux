import connectDB from "../../../../lib/db";
import User from '../../../../models/userModel'
import Order from '../../../../models/orderModel'
import { getDataFromToken, getAuthErrorResponse, AuthError } from '../../../../helper/getDataFromToken'

export async function GET(request) {
    try {
        // Ensure DB is connected
        await connectDB();

        // Extract user ID from JWT - this now throws AuthError with proper codes
        let userId;
        try {
            userId = await getDataFromToken(request);
        } catch (authError) {
            const errorResponse = getAuthErrorResponse(authError);
            return new Response(JSON.stringify(errorResponse), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Find user by ID (never return password hash)
        const user = await User.findOne({ _id: userId }).select('-password').lean();
        if (!user) {
            return new Response(JSON.stringify({ 
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const accountCreated = new Date(user.createdAt || user._id.getTimestamp());
        const accountAge = Math.floor((new Date() - accountCreated) / (1000 * 60 * 60 * 24));
        const includeStats = new URL(request.url).searchParams.get('stats') === '1';

        // Session / layout only needs the user document. Full order stats are
        // expensive and belong on My Account (?stats=1) or /api/dashboard/stats.
        if (!includeStats) {
            return new Response(JSON.stringify({
                ...user,
                stats: { accountAge },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const orders = await Order.find({ user: userId })
            .select('price status provisioningStatus createdAt productName renewalPayments.amount')
            .lean()
            .maxTimeMS(8000);

        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, order) => sum + (order.price || 0), 0);
        const renewalSpent = orders.reduce((sum, order) => {
            if (order.renewalPayments && order.renewalPayments.length > 0) {
                return sum + order.renewalPayments.reduce((renewalSum, renewal) => renewalSum + (renewal.amount || 0), 0);
            }
            return sum;
        }, 0);

        const recentOrders = orders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        const userWithStats = {
            ...user,
            stats: {
                totalOrders,
                totalSpent,
                totalSpentIncludingRenewals: totalSpent + renewalSpent,
                renewalSpent,
                accountAge,
                lastLogin: new Date(),
                averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
                ordersByStatus: {
                    completed: orders.filter(order => order.status === 'completed').length,
                    pending: orders.filter(order => order.status === 'pending' || order.status === 'confirmed').length,
                    failed: orders.filter(order => order.status === 'failed').length,
                    active: orders.filter(order => order.provisioningStatus === 'active').length
                },
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
