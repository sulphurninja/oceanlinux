import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

export async function GET() {
  try {
    await connectDB();

    const orders = await Order.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    // The page expects a plain array
    return NextResponse.json(orders);
  } catch (error) {
    console.error('[ADMIN/ORDERS][GET] Error:', error);
    return NextResponse.json({ message: 'Failed to fetch orders', error: error.message }, { status: 500 });
  }
}
