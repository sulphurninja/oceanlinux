import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { adminTotpFailure } from '@/lib/adminTotp';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || '').trim();
    const confirm = String(body.confirm || '').trim();
    const totpError = adminTotpFailure(body.authCode);
    if (totpError) {
      return NextResponse.json({ success: false, message: totpError.message }, { status: totpError.status });
    }

    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      return NextResponse.json({ success: false, message: 'Invalid order id' }, { status: 400 });
    }

    const order = await Order.findById(orderId)
      .select('ipAddress productName price status customerEmail')
      .lean();

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const ip = String(order.ipAddress || '').trim();
    const expected = ip || orderId;
    if (confirm !== expected) {
      return NextResponse.json(
        {
          success: false,
          message: ip ? 'Type the IP exactly to confirm delete' : 'Type the order id exactly to confirm delete',
        },
        { status: 400 }
      );
    }

    await Order.deleteOne({ _id: order._id });

    return NextResponse.json({
      success: true,
      deleted: {
        orderId,
        ip,
        product: order.productName || '',
        price: Number(order.price) || 0,
      },
    });
  } catch (error) {
    console.error('[ADMIN-DELETE-ORDER]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Delete failed' },
      { status: 500 }
    );
  }
}
