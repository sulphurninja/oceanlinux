import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

const {
  listExpiredTrialSlotsAwaitingRelease,
  dismissExpiredTrialListForOrders,
} = require('@/lib/trialVpsExpiredSlots');

export async function GET(request) {
  await connectDB();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 150);
    const items = await listExpiredTrialSlotsAwaitingRelease({ limit });
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('[TRIAL-VPS] expired list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  await connectDB();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'clear') {
      return NextResponse.json({ error: 'Use action: "clear"' }, { status: 400 });
    }

    let orderIds = [];
    if (body.clearAll === true) {
      const items = await listExpiredTrialSlotsAwaitingRelease({ limit: 500 });
      orderIds = items.map((row) => row.orderId);
    } else {
      orderIds = Array.isArray(body.orderIds) ? body.orderIds : [];
    }
    if (!orderIds.length) {
      return NextResponse.json({ success: true, cleared: 0 });
    }

    const { updated, matched } = await dismissExpiredTrialListForOrders(orderIds);
    return NextResponse.json({
      success: true,
      cleared: updated,
      matched: matched ?? updated,
      requested: orderIds.length,
    });
  } catch (error) {
    console.error('[TRIAL-VPS] expired clear error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
