import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(request) {
  await connectDB();

  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    const orders = await Order.find().populate('user', 'email name').sort({ createdAt: -1 });
    return NextResponse.json(orders, { status: 200 });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
