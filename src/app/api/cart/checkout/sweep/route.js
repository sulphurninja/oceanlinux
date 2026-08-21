import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { refundAndFailCheckoutSession } from '@/lib/paymentDispatch';
import { sweepAbandonedBuyNowOrders } from '@/lib/cancelPendingOrder';
import { enforceCronSecret } from '@/lib/apiSecurity';

/**
 * POST /api/cart/checkout/sweep
 *
 * Cron-friendly endpoint that finds abandoned pending payments older than
 * `staleAfterMinutes` (default 30) and returns any reserved wallet money:
 *   - CheckoutSession docs (multi-item cart): probe gateway first, confirm if paid
 *   - single Buy Now Order docs with a live wallet deduction: probe the
 *     gateway, confirm if paid, otherwise refund the wallet reservation
 *
 * Auth: CRON_SECRET required (fail closed).
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  await connectDB();

  const url = new URL(request.url);
  const staleAfterMinutes = Math.max(5, Number(url.searchParams.get('minutes')) || 30);
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);

  // Recover checkout sessions stuck mid-confirm (server crash during atomic lock).
  // Recharges that already wrote walletTxnId must be confirmed, not reopened.
  const stuckProcessingCutoff = new Date(Date.now() - 10 * 60 * 1000);
  await CheckoutSession.updateMany(
    { status: 'processing', updatedAt: { $lt: stuckProcessingCutoff } },
    { $set: { status: 'pending' } }
  );
  await WalletRecharge.updateMany(
    {
      status: 'processing',
      updatedAt: { $lt: stuckProcessingCutoff },
      walletTxnId: { $exists: true, $nin: [null, ''] },
    },
    { $set: { status: 'confirmed', creditedAt: new Date() } }
  );
  await WalletRecharge.updateMany(
    {
      status: 'processing',
      updatedAt: { $lt: stuckProcessingCutoff },
      $or: [{ walletTxnId: null }, { walletTxnId: '' }, { walletTxnId: { $exists: false } }],
    },
    { $set: { status: 'pending' } }
  );

  const sessions = await CheckoutSession.find({
    status: { $in: ['pending', 'failed', 'cancelled'] },
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
        recovered: result.alreadyProcessed && session.status !== 'confirmed',
        action: result.success && result.sessionId ? 'processed' : result.reason,
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
  return POST(request);
}
