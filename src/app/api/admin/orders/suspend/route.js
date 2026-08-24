import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { orderId, suspended, message } = await request.json();

    if (!orderId) {
      return NextResponse.json({ message: 'orderId is required' }, { status: 400 });
    }

    const shouldSuspend = suspended !== false;
    const trimmedMessage = String(message || '').trim();

    if (shouldSuspend && !trimmedMessage) {
      return NextResponse.json({ message: 'Suspend message is required' }, { status: 400 });
    }

    const update = shouldSuspend
      ? {
          adminSuspended: true,
          adminSuspendMessage: trimmedMessage.slice(0, 2000),
          adminSuspendedAt: new Date(),
        }
      : {
          adminSuspended: false,
          adminSuspendMessage: '',
          adminSuspendedAt: null,
        };

    const order = await Order.findByIdAndUpdate(orderId, update, { new: true }).lean();
    if (!order) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: shouldSuspend ? 'Order suspended for customer' : 'Order unsuspended',
      order: {
        _id: order._id,
        adminSuspended: order.adminSuspended,
        adminSuspendMessage: order.adminSuspendMessage,
        adminSuspendedAt: order.adminSuspendedAt,
      },
    });
  } catch (error) {
    console.error('[ADMIN/ORDERS/SUSPEND]', error);
    return NextResponse.json({ message: 'Failed to update suspend status' }, { status: 500 });
  }
}
