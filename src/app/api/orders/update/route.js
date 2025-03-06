import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
// import { requireAdmin } from '@/helper/requireAdmin';

export async function POST(request) {
  await connectDB();

  try {
    // requireAdmin(); // If you have an admin check, do it here

    const { orderId, ipAddress, username, password, status, os } = await request.json();
    if (!orderId) {
      return NextResponse.json(
        { message: 'Missing orderId' },
        { status: 400 }
      );
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        ipAddress: ipAddress || '',
        username: username || '',
        password: password || '',
        os: os || 'CentOS 7',
        status: status || 'pending'
      },
      { new: true }
    );

    if (!updatedOrder) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(
      { message: 'Order updated', order: updatedOrder },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
