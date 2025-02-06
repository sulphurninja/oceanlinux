// pages/api/orders/all.js
import connectDB from '../../../../lib/db';
import Order from '../../../../models/orderModel';

export async function GET() {
    await connectDB();
    try {
        console.log("Using database:", mongoose.connection.name);
        
        const orders = await Order.find({}).lean();
        
        console.log("Fetched orders count:", orders.length);
        console.log("First order:", orders[0]);  // Check order structure
        
        return new Response(JSON.stringify(orders), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("MongoDB Fetch Error:", error);
        return new Response(JSON.stringify({ message: 'Failed to fetch orders', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
