import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret } from '@/lib/apiSecurity';
import { runPaidButPendingScan } from '@/lib/paidButPendingScan';

export const maxDuration = 300;

/**
 * Auto "Scan paid-but-pending" — same as /admin/status manual button.
 * Schedule: every 15 min (vercel.json + EC2 crontab).
 *
 * Query: ?hours=72&limit=40
 * Auth: CRON_SECRET (x-cron-secret header or ?secret=)
 */
export async function GET(request) {
  const denied = enforceCronSecret(request);
  if (denied) return denied;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const hours = searchParams.get('hours');
    const limit = searchParams.get('limit');

    const result = await runPaidButPendingScan({
      hours: hours ? Number(hours) : 72,
      limit: limit ? Number(limit) : 40,
      logSource: 'scan-cron',
    });

    console.log(
      `[PAID-BUT-PENDING-CRON] scanned=${result.scanned} carts=${result.scannedCarts} ` +
        `recharges=${result.scannedRecharges} recovered=${result.recoveredCount} anomalies=${result.anomalyCount}`
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[PAID-BUT-PENDING-CRON] error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Scan failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
