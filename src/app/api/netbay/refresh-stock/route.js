import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { refreshNetbayStockForCustomer } from '@/lib/netbayLiveStock';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Customer-facing Netbay stock refresh — called when users open IP Stock.
 * Checks GET /api/v1/services/stock for each configured plan + OS.
 *
 * Query: ?force=1 — bypass throttle
 */
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';
    const result = await refreshNetbayStockForCustomer({ force });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[NETBAY-REFRESH-STOCK] error:', error);
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        error: error.message || 'Netbay refresh failed',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
