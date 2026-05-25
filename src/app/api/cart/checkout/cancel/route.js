import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import CheckoutSession from '@/models/checkoutSessionModel';
import { refundAndFailCheckoutSession } from '@/lib/paymentDispatch';

/**
 * POST /api/cart/checkout/cancel
 *
 * Body: { clientTxnId }
 *
 * User-initiated cancel of a pending session before payment lands.
 * Refunds wallet reservation and marks the session+orders cancelled.
 * Idempotent.
 */
export async function POST(request) {
  await connectDB();

  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return NextResponse.json({ success: false, message: err?.message || 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { clientTxnId } = body || {};
  if (!clientTxnId) {
    return NextResponse.json({ success: false, message: 'clientTxnId is required' }, { status: 400 });
  }

  const session = await CheckoutSession.findOne({ clientTxnId });
  if (!session) {
    return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
  }
  if (String(session.user) !== String(userId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const result = await refundAndFailCheckoutSession(session, 'cancelled');
  return NextResponse.json({
    success: !!result.success,
    sessionId: session._id,
    alreadyProcessed: !!result.alreadyProcessed,
    message: result.success ? 'Checkout cancelled and wallet refunded' : (result.reason || 'Cancel failed'),
  });
}
