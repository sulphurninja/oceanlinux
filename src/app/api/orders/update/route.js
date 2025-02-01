// pages/api/orders/update/[id].js
import connectDB from '../../../../lib/db';
import Order from '../../../../models/orderModel';

export async function POST(request) {
    const { username, password, orderId } = await request.json();
    await connectDB();
    try {
        await Order.findByIdAndUpdate(orderId,
            {
                username,
                password,
                status: 'Active'  // Set status to 'Active' when username and password are updated
            },
            { new: true }  // Option to return the updated document
        );
        return new Response(JSON.stringify({ message: 'Order updated successfully' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Error updating order', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
