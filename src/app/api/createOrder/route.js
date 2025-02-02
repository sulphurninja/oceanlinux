import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import axios from 'axios';

export async function POST(request) {
    await connectDB();

    try {
        const userId = await getDataFromToken(request);
        const reqBody = await request.json();
        const { productName, memory, price } = reqBody;

        const orderId = `order_${Date.now()}`;

        // ✅ Ensure API Keys are loaded correctly
        const clientId = process.env.CASHFREE_APP_ID;
        const clientSecret = process.env.CASHFREE_SECRET_KEY;

        if (!clientId || !clientSecret) {
            console.error("❌ Missing API Credentials");
            return new NextResponse(JSON.stringify({ message: "API Credentials Missing" }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ✅ Save order in the database as pending
        const newOrder = await Order.create({
            user: userId,
            productName,
            memory,
            price,
            paymentId: orderId,
            status: "pending"
        });

        // ✅ Prepare Order Data for Cashfree API
        const orderData = {
            order_id: orderId,
            order_amount: price,
            order_currency: 'INR',
            customer_details: {
                customer_id: userId,
                customer_email: 'customer_email@example.com',
                customer_phone: '9999999999',
            },
            order_meta: {
                return_url: `https://oceanlinux.in/payment-success?order_id=${orderId}`
            }
        };

        console.log("🔹 Sending Order Data to Cashfree:", orderData);

        // ✅ Make API Call to Cashfree
        const response = await axios.post(
            'https://api.cashfree.com/pg/orders',
            orderData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-version': '2023-08-01',
                    'x-client-id': clientId,
                    'x-client-secret': clientSecret,
                },
            }
        );

        console.log("✅ Cashfree API Response:", response.data);

        const { payment_session_id } = response.data;

        if (!payment_session_id) {
            console.error("❌ Cashfree Response Missing `payment_session_id`:", response.data);
            return new NextResponse(JSON.stringify({ message: "Failed to generate payment session.", error: response.data }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new NextResponse(JSON.stringify({
            orderId,
            paymentSessionId: payment_session_id // ✅ Use `payment_session_id`
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("❌ Cashfree API Error:", error.response?.data || error.message);
        return new NextResponse(JSON.stringify({ message: 'Cashfree API Error', error: error.response?.data || error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
