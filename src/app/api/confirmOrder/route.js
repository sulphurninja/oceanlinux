import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import axios from 'axios';

export async function POST(request) {
    await connectDB();

    try {
        const reqBody = await request.json();
        const { orderId } = reqBody;

        // ✅ Fetch Order Details from Database
        const existingOrder = await Order.findOne({ paymentId: orderId });

        if (!existingOrder) {
            return new NextResponse(JSON.stringify({ message: "Order not found." }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ✅ Fetch order status from Cashfree
        const response = await axios.get(
            `https://api.cashfree.com/pg/orders/${orderId}`,
            {
                headers: {
                    'x-api-version': '2023-08-01',
                    'x-client-id': process.env.CASHFREE_APP_ID,
                    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                },
            }
        );

        const { order_status } = response.data;

        if (order_status !== 'PAID') {
            return new NextResponse(JSON.stringify({ message: "Payment not confirmed yet." }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ✅ Update order status in the database
        existingOrder.status = "paid";
        await existingOrder.save();

        return new NextResponse(JSON.stringify({ message: "Order confirmed.", order: existingOrder }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("❌ Error verifying payment:", error);
        return new NextResponse(JSON.stringify({ message: 'Error verifying payment.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
