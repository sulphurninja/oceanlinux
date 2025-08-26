import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function GET(request, { params }) {
    try {
        await connectDB();
        const userId = await getDataFromToken(request);
        
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const orderId = params.id;
        const order = await Order.findOne({ _id: orderId, user: userId }).lean();
        
        if (!order) {
            return NextResponse.json({ message: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { message: 'Failed to fetch order', error: error.message },
            { status: 500 }
        );
    }
}