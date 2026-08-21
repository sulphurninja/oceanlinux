import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { createResellerOrder, sanitizeResellerOrder } from '@/lib/resellerOrderApi';

export async function GET(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const orders = await Order.find({ resellerId: auth.reseller._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders: orders.map(sanitizeResellerOrder),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const result = await createResellerOrder(auth.reseller, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[RESELLER-ORDERS] POST error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
