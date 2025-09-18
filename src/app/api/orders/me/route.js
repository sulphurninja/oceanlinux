import connectDB from '../../../../lib/db';
import Order from '../../../../models/orderModel';
import { getDataFromToken } from '../../../../helper/getDataFromToken'; // Adjust the import path as necessary

export async function GET(request) {
    try {
        // Ensure DB is connected
        await connectDB();

        // Extract user ID from JWT in the Authorization header
        const userId = await getDataFromToken(request);

        // Find orders by user ID
        const orders = await Order.find({ user: userId }).lean().sort({ createdAt: -1 });

        // Return orders to client
        return new Response(JSON.stringify(orders), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch orders', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
