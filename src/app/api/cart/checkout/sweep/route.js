import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import CheckoutSession from '@/models/checkoutSessionModel';
import { refundAndFailCheckoutSession } from '@/lib/paymentDispatch';
import { sweepAbandonedBuyNowOrders } from '@/lib/cancelPendingOrder';

/**
 * POST /api/cart/checkout/sweep
 *
 * Cron-friendly endpoint that finds abandoned pending payments older than
 * `staleAfterMinutes` (default 30) and returns any reserved wallet money:
 *   - CheckoutSession docs (multi-item cart): refund wallet + fail session/orders
 *   - single Buy Now Order docs with a live wallet deduction: probe the
 *     gateway, confirm if paid, otherwise refund the wallet reservation
 *
 * Idempotent: subsequent runs skip already-cancelled/failed/released records.
 *
 * Auth: this endpoint can be called from a cron job; if a CRON_SECRET
 * env var is present we require `?secret=...` to match (else open).
 */
export async function POST(request) {
  await connectDB();

  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const secret =
    url.searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    bearer;
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

  // Also sweep abandoned single Buy Now orders that still hold wallet money.
  let buyNow = { swept: 0, results: [] };
  try {
    buyNow = await sweepAbandonedBuyNowOrders({ staleAfterMinutes });
  } catch (err) {
    buyNow = { swept: 0, results: [], error: err.message };
  }

  return NextResponse.json({
    success: true,
    cutoff: cutoff.toISOString(),
    staleAfterMinutes,
    swept: results.length,
    results,
    buyNowOrders: buyNow,
  });
}

export async function GET(request) {
  // Convenience GET for ad-hoc browser checks; same logic.
  return POST(request);
}
