// app/api/admin/orders/route.ts
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET() {
  try {
    await connectDB();

    const orders = await Order.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();   // ⬅️ faster response

    return NextResponse.json(orders, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN/ORDERS][GET] Error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch orders', error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
