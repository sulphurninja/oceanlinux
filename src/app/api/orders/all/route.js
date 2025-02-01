// pages/api/orders/all.js
import connectDB from '../../../../lib/db';
import Order from '../../../../models/orderModel';

export async function GET() {
    await connectDB();
    try {
        const orders = await Order.find({});  // Assuming you want to show user emails
        return new Response(JSON.stringify(orders), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Failed to fetch orders', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
