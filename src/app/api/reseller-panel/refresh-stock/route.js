import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { refreshResellerStockForCustomer } from '@/lib/resellerLiveStock';
import { enforceCronSecret, enforceCronOrLoggedInUser } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * PrimeVPS / Hostheaven live stock refresh — wallet + pricing catalog.
 * Throttled globally (~8 min). Cron: GET ?force=1 with CRON_SECRET.
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
    const result = await refreshResellerStockForCustomer({ force });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[RESELLER-PANEL-REFRESH-STOCK] error:', error);
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        error: error.message || 'Reseller panel refresh failed',
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
