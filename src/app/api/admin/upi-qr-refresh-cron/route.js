import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret } from '@/lib/apiSecurity';
import { refreshExpiringVyaparUpiPayments } from '@/lib/refreshVyaparUpiOrder';

export const maxDuration = 120;

/**
 * Proactively refresh Vyapar UPI QRs before they expire (~2 min window).
 * Schedule every 1 min on EC2 alongside paid-but-pending cron.
 *
 * Auth: CRON_SECRET
 */
export async function GET(request) {
  const denied = enforceCronSecret(request);
  if (denied) return denied;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');

    const result = await refreshExpiringVyaparUpiPayments({
      limit: limit ? Number(limit) : 30,
    });

    if (result.refreshedCount > 0) {
      console.log(
        `[UPI-QR-REFRESH-CRON] refreshed=${result.refreshedCount}`,
        result.refreshed.map((r) => r.clientTxnId).join(', ')
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[UPI-QR-REFRESH-CRON] error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Refresh cron failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
