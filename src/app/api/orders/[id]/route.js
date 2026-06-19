import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { resolveOrderForUserOrAdmin } from '@/lib/resolveOrderAccess';

export async function GET(request, { params }) {
    try {
        await connectDB();

        const orderId = params.id;
        const resolved = await resolveOrderForUserOrAdmin(request, orderId, { lean: true });
        if (resolved.error) return resolved.error;

        return NextResponse.json(resolved.order);
    } catch (error) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { message: 'Failed to fetch order', error: error.message },
            { status: 500 }
        );
    }
}