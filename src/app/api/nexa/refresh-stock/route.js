import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret, enforceCronOrLoggedInUser } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Nexa dedicated IP pool stock — mirrors Nexa getPlans stock onto IPStock rows.
 * Runs during IST peak (unlike reseller/netbay bulk refresh). Throttled ~3 min for dashboard; cron uses ?force=1.
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
    const { refreshNexaStockForCustomer } = require('@/lib/nexaStoreStock');
    const result = await refreshNexaStockForCustomer({ force });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[NEXA-REFRESH-STOCK] error:', error);
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        error: error.message || 'Nexa stock refresh failed',
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
