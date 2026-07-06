import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';

const {
  completeResellerPendingOrder,
  syncStuckResellerPendingOrders,
} = require('@/lib/resellerApiOrderSync');

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Admin — pull IP/password from primevm.in for a stuck order (or sync all stuck). */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const orderId = body?.orderId || body?.id;

    if (!orderId) {
      const results = await syncStuckResellerPendingOrders({ limit: 15 });
      return NextResponse.json({ success: true, mode: 'batch', results });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const ipStock = order.ipStockId ? await IPStock.findById(order.ipStockId) : null;
    if (!ipStock) {
      return NextResponse.json({ success: false, error: 'No IP stock linked to order' }, { status: 400 });
    }

    const result = await completeResellerPendingOrder(order, ipStock);
    const updated = await Order.findById(orderId).lean();

    return NextResponse.json({
      success: !!result.success,
      mode: 'single',
      orderId: String(orderId),
      sync: result,
      order: updated,
    });
  } catch (error) {
    console.error('[ADMIN/RESELLER-SYNC-ORDER]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return POST(request);
}
