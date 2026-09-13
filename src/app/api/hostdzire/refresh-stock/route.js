import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { refreshHostdzireStockForCustomer } from '@/lib/hostdzireLiveStock';
import { enforceCronSecret, enforceCronOrLoggedInUser, enforceAdmin } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** GET/POST — refresh HostDzire inventory qty on linked IP stocks (?force=1 for admin/cron) */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    if (force) {
      const cronDenied = enforceCronSecret(request);
      if (cronDenied) {
        const adminDenied = await enforceAdmin(request);
        if (adminDenied) return adminDenied;
      }
    } else {
      const authDenied = enforceCronOrLoggedInUser(request);
      if (authDenied) return authDenied;
    }

    await connectDB();
    const result = await refreshHostdzireStockForCustomer({ force });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[HOSTDZIRE-REFRESH-STOCK] error:', error);
    return NextResponse.json(
      {
        success: false,
        skipped: true,
        error: error.message || 'HostDzire refresh failed',
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
