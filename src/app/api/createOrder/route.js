// pages/api/createOrder.js
import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db'; // Adjust the import path for database connection
import Order from '../../../models/orderModel'; // Adjust the import path to your Order model
import jwt from 'jsonwebtoken';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function POST(request) {
    await connectDB();

    try {
        const userId = await getDataFromToken(request);
        const reqBody = await request.json();
        const { productName, memory, price, paymentId, status } = reqBody;

        const newOrder = await Order.create({
            user: userId,
            productName,
            memory,
            price,
            paymentId,
            status
        });
        console.log(newOrder, 'order payload')
        return new NextResponse(JSON.stringify(newOrder), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.log(error, 'error')
        return new NextResponse(JSON.stringify({ message: 'Something went wrong.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
