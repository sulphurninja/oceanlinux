import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import CheckoutSession from '@/models/checkoutSessionModel';
import { refundAndFailCheckoutSession } from '@/lib/paymentDispatch';

/**
 * POST /api/cart/checkout/sweep
 *
 * Cron-friendly endpoint that finds CheckoutSession docs in 'pending'
 * state older than `staleAfterMinutes` (default 30) and:
 *   - refunds any wallet reservation (`walletAmount` > 0)
 *   - marks the session AND its child orders 'failed'
 *
 * Idempotent: subsequent runs skip already-cancelled/failed sessions.
 *
 * Auth: this endpoint can be called from a cron job; if a CRON_SECRET
 * env var is present we require `?secret=...` to match (else open).
 */
export async function POST(request) {
  await connectDB();

  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const staleAfterMinutes = Math.max(5, Number(url.searchParams.get('minutes')) || 30);
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);

  const sessions = await CheckoutSession.find({
    status: 'pending',
    createdAt: { $lt: cutoff },
  }).limit(200);

  const results = [];
  for (const session of sessions) {
    try {
      const result = await refundAndFailCheckoutSession(session, 'abandoned');
      results.push({
        sessionId: session._id,
        clientTxnId: session.clientTxnId,
        walletRefunded: session.walletAmount > 0,
        success: !!result.success,
      });
    } catch (err) {
      results.push({
        sessionId: session._id,
        clientTxnId: session.clientTxnId,
        success: false,
        error: err.message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    cutoff: cutoff.toISOString(),
    staleAfterMinutes,
    swept: results.length,
    results,
  });
}

export async function GET(request) {
  // Convenience GET for ad-hoc browser checks; same logic.
  return POST(request);
}
