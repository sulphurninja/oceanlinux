import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import { cancelPendingBuyNowOrder, cancelPendingRenewal } from '@/lib/cancelPendingOrder';
import { probeGatewayPayment } from '@/lib/confirmPendingOrderPayment';

/**
 * POST /api/payment/cancel
 *
 * Body: { clientTxnId?, orderId? }
 *
 * User-initiated cancel before gateway payment lands.
 * - ORDER_*  → pending buy-now order (refunds wallet reservation)
 * - RENEWAL_* → pending renewal (refunds wallet only if it was actually debited)
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

  let { clientTxnId, orderId, userInitiated } = body || {};
  if (!clientTxnId && !orderId) {
    return NextResponse.json(
      { success: false, message: 'clientTxnId or orderId is required' },
      { status: 400 }
    );
  }

  let order = null;
  let isRenewal = false;

  if (clientTxnId) {
    isRenewal = String(clientTxnId).startsWith('RENEWAL_');
    order = isRenewal
      ? await Order.findOne({ 'pendingRenewal.renewalTxnId': clientTxnId })
      : await Order.findOne({ clientTxnId });
  }

  if (!order && orderId) {
    order = await Order.findById(orderId);
    if (order?.pendingRenewal?.renewalTxnId) {
      isRenewal = true;
      clientTxnId = order.pendingRenewal.renewalTxnId;
    }
  }

  if (!order) {
    return NextResponse.json({
      success: true,
      alreadyProcessed: true,
      refunded: 0,
      message: isRenewal ? 'Renewal already released or not found' : 'Order not found',
    });
  }

  if (String(order.user) !== String(userId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  // If gateway already captured payment, recover instead of cancelling
  // (skip when user explicitly abandoned checkout — they want wallet back)
  if (!isRenewal && order.status === 'pending' && !userInitiated) {
    const probe = await probeGatewayPayment(order);
    if (probe.success) {
      const { confirmPendingOrderPayment } = await import('@/lib/confirmPendingOrderPayment');
      const recovery = await confirmPendingOrderPayment(order, probe);
      if (recovery.confirmed) {
        return NextResponse.json({
          success: true,
          recovered: true,
          orderId: order._id,
          message: 'Payment was already successful — order confirmed',
        });
      }
    }
  }

  const result = isRenewal
    ? await cancelPendingRenewal(order, 'cancelled')
    : await cancelPendingBuyNowOrder(order, 'cancelled');

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
          : 'Payment released'
      : result.reason || 'Cancel failed',
  });
}
