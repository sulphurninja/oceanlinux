import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

const { listExpiredTrialSlotsAwaitingRelease } = require('@/lib/trialVpsExpiredSlots');

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
