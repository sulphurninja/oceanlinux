import connectDB from '../../../../lib/db';
import Order from '../../../../models/orderModel';
import { getDataFromToken } from '../../../../helper/getDataFromToken';
import { isAdminUser } from '@/lib/adminAuth';
const { sanitizeOrdersForCustomer, customerApiCatchPayload } = require('@/lib/customerFacingErrors');

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        const isAdmin = await isAdminUser(request).catch(() => false);
        const orders = await Order.find({ user: userId }).lean().sort({ createdAt: -1 });
        const safeOrders = sanitizeOrdersForCustomer(orders, { isAdmin });

        return new Response(JSON.stringify(safeOrders), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        return new Response(JSON.stringify({
            message: 'Failed to fetch orders',
            ...customerApiCatchPayload(error.message),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
