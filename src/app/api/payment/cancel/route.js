import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import { cancelPendingBuyNowOrder } from '@/lib/cancelPendingOrder';

/**
 * POST /api/payment/cancel
 *
 * Body: { clientTxnId }
 *
 * User-initiated cancel of a pending buy-now order before gateway payment lands.
 * Refunds wallet reservation and keeps the order pending. Idempotent.
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

  const order = await Order.findOne({ clientTxnId });
  if (!order) {
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  if (String(order.user) !== String(userId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const result = await cancelPendingBuyNowOrder(order, 'cancelled');

  return NextResponse.json({
    success: !!result.success,
    orderId: result.orderId,
    alreadyProcessed: !!result.alreadyProcessed,
    refunded: result.refunded || 0,
    message: result.success
      ? result.alreadyProcessed
        ? 'Payment already released'
        : result.refunded > 0
          ? `Payment released and ₹${result.refunded} returned to wallet`
          : 'Payment released — order remains pending'
      : result.reason || 'Cancel failed',
  });
}
