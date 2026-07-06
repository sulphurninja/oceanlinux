import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { refreshResellerStockForCustomer } from '@/lib/resellerLiveStock';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Admin force sync — bypasses 8 min customer throttle (zone status + wallet). */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();
    const result = await refreshResellerStockForCustomer({ force: true });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[ADMIN/RESELLER-REFRESH-STOCK]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Refresh failed' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return POST(request);
}
