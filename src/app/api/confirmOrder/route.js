import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import axios from 'axios';
import { blockUnlessDevOrCron } from '@/lib/apiSecurity';

/** @deprecated Legacy Cashfree confirm — disabled in production. Use /api/payment/confirm */
export async function POST(request) {
    const blocked = blockUnlessDevOrCron(request);
    if (blocked) return blocked;

    await connectDB();

    try {
        const reqBody = await request.json();
        const { orderId } = reqBody;

        const existingOrder = await Order.findOne({ paymentId: orderId });

        if (!existingOrder) {
            return new NextResponse(JSON.stringify({ message: "Order not found." }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

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

        existingOrder.status = "paid";
        await existingOrder.save();

        return new NextResponse(JSON.stringify({ message: "Order confirmed.", orderId: existingOrder._id }), {
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
