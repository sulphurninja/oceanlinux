import { NextResponse } from 'next/server';
import { refreshAdvpsStockForCustomer } from '@/lib/advpsStockRefresh';
import { enforceCronSecret, enforceCronOrLoggedInUser } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Customer-facing ADVPS refresh — called when users open IP Stock.
 * Runs catalog sync + live stock check (throttled to once per minute per instance).
 *
 * Query: ?force=1 — cron secret required
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

    const { isIstPeakTrafficHour, istPeakSkipBody } = require('@/lib/istPeakTraffic');
    if (isIstPeakTrafficHour()) {
      return NextResponse.json(istPeakSkipBody(), {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

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
