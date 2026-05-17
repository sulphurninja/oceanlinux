import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { checkAdvpsPendingOrders } from '@/lib/advpsPendingOrdersCron';

/**
 * ADVPS-only follow-up cron: completes orders stuck in ADVPS_PENDING (awaiting IP/assignment).
 * Use from AWS Lambda every ~15 min to stay under ADVPS rate limits; main auto-provision-cron still runs Phase 0 too unless you remove it there later.
 */
export async function POST() {
  const cronId = Math.random().toString(36).substring(2, 8);
  const started = Date.now();
  try {
    await connectDB();
    const results = await checkAdvpsPendingOrders();
    const completed = results.filter((r) => r.result === 'completed').length;
    const pending = results.filter((r) => r.result === 'still_pending' || r.result === 'no_ip_yet').length;

    return NextResponse.json({
      success: true,
      cronId,
      advpsChecked: results.length,
      advpsCompleted: completed,
      advpsStillPending: pending,
      results,
      ms: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[ADVPS-PENDING-CRON-${cronId}]`, error);
    return NextResponse.json(
      {
        success: false,
        cronId,
        error: error.message,
        ms: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
