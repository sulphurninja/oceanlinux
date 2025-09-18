import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
// If you have an auth check for admin, do it here
// import { requireAdmin } from '@/helper/requireAdmin';

export async function GET() {
  await connectDB();

  try {
    // requireAdmin(); // If you have an admin check, do it here

    const orders = await Order.find().populate('user', 'email').sort({createdAt: -1});
    return NextResponse.json(orders, { status: 200 });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
