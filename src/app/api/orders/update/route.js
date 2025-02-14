import connectDB from '../../../../lib/db';
import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export async function POST(request) {
    await connectDB();
    
    try {
        const { username, password, ipAddress, orderId } = await request.json();

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return new Response(JSON.stringify({ message: 'Invalid order ID' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const updatedOrder = await Order.findByIdAndUpdate(orderId, {
            username,
            password,
            ipAddress,
            status: 'Active'  // Automatically mark as active when credentials are updated
        }, { new: true });

        if (!updatedOrder) {
            return new Response(JSON.stringify({ message: 'Order not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ message: 'Order updated successfully', order: updatedOrder }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("❌ Error updating order:", error);
        return new Response(JSON.stringify({ message: 'Error updating order', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
