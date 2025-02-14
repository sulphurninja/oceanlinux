import connectDB from '../../../../lib/db';
import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export async function GET() {
    await connectDB();
    try {
        console.log("✅ Fetching all orders...");

        const orders = await Order.find({}).sort({ createdAt: -1 }).lean().exec();

        console.log("📦 Total Orders:", orders.length);
        if (orders.length > 0) {
            console.log("📝 Sample Order:", orders[0]);
        }

        return new Response(JSON.stringify(orders), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    } catch (error) {
        console.error("❌ Error fetching all orders:", error);
        return new Response(JSON.stringify({ message: 'Failed to fetch orders', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
