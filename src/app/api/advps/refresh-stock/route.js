import { NextResponse } from 'next/server';
import { refreshAdvpsStockForCustomer } from '@/lib/advpsStockRefresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Customer-facing ADVPS refresh — called when users open IP Stock.
 * Runs catalog sync + live stock check (throttled to once per minute per instance).
 *
 * Query: ?force=1 — bypass throttle (admin/cron only recommended)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';
    const result = await refreshAdvpsStockForCustomer({ force });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[ADVPS-REFRESH-STOCK] error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'ADVPS refresh failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
