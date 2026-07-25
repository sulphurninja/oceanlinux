import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { refreshKurohostStockForCustomer } from '@/lib/kurohostLiveStock';
import { enforceCronSecret, enforceCronOrLoggedInUser } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * KuroHost zone stock refresh — throttled globally (8 min). Cron + customer page.
 *
 * Query: ?force=1 — bypass throttle (cron / admin)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    if (force) {
      const cronDenied = enforceCronSecret(request);
      if (cronDenied) return cronDenied;
    } else {
      const authDenied = enforceCronOrLoggedInUser(request);
      if (authDenied) return authDenied;
    }

    await connectDB();
    const result = await refreshKurohostStockForCustomer({ force });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[KUROHOST-REFRESH-STOCK] error:', error);
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        error: error.message || 'KuroHost refresh failed',
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
