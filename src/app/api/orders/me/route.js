import connectDB from '../../../../lib/db';
import Order from '../../../../models/orderModel';
import User from '../../../../models/userModel';
import { getDataFromToken, getAuthErrorResponse } from '../../../../helper/getDataFromToken';
import { isAdminUser } from '@/lib/adminAuth';
const { sanitizeOrdersForCustomer, customerApiCatchPayload } = require('@/lib/customerFacingErrors');

export async function GET(request) {
    try {
        await connectDB();

        let userId;
        try {
            userId = getDataFromToken(request);
        } catch (authError) {
            const errorResponse = getAuthErrorResponse(authError);
            return new Response(JSON.stringify(errorResponse), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const user = await User.findById(userId).select('_id userType isAdmin role').lean();
        if (!user) {
            return new Response(JSON.stringify({
                message: 'User not found',
                code: 'USER_NOT_FOUND',
                success: false,
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const orders = await Order.find({ user: userId }).lean().sort({ createdAt: -1 });
        const safeOrders = sanitizeOrdersForCustomer(orders, { isAdmin: isAdminUser(user) });

        return new Response(JSON.stringify(safeOrders), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        return new Response(JSON.stringify({
            message: 'Failed to fetch orders',
            ...customerApiCatchPayload(error.message),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
