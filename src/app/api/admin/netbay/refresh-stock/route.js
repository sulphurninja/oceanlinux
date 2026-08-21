import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { refreshNetbayStockForCustomer } from '@/lib/netbayLiveStock';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** POST /api/admin/netbay/refresh-stock — admin force sync (recovery from rate-limit stale data). */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();
    const result = await refreshNetbayStockForCustomer({ force: true });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[ADMIN/NETBAY-REFRESH-STOCK]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Refresh failed' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return POST(request);
}
