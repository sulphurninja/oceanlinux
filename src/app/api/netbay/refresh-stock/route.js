import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { refreshNetbayStockForCustomer } from '@/lib/netbayLiveStock';
import { enforceCronSecret, enforceCronOrLoggedInUser } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Netbay stock refresh — throttled globally (5 min). Used by cron and optional manual force.
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
      const { isIstPeakTrafficHour, istPeakSkipBody } = require('@/lib/istPeakTraffic');
      if (isIstPeakTrafficHour()) {
        return NextResponse.json(istPeakSkipBody(), {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    } else {
      const authDenied = enforceCronOrLoggedInUser(request);
      if (authDenied) return authDenied;
    }

    const { isIstPeakTrafficHour: peakHour, istPeakSkipBody: peakBody } = require('@/lib/istPeakTraffic');
    if (peakHour()) {
      return NextResponse.json(peakBody(), {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    await connectDB();
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
