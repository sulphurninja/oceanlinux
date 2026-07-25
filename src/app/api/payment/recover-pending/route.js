import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { recoverPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import { enforceCronSecret } from '@/lib/apiSecurity';

/**
 * POST /api/payment/recover-pending
 *
 * Reconcile pending buy-now orders whose gateway payment succeeded but
 * confirmation was missed (callback race, webhook delay, etc.).
 *
 * Query: ?minutes=60&limit=50
 * Auth: CRON_SECRET via Authorization Bearer, x-cron-secret, or ?secret=
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  await connectDB();

  const url = new URL(request.url);
  const lookbackMinutes = Math.max(10, Number(url.searchParams.get('minutes')) || 120);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const pendingOrders = await Order.find({
    status: 'pending',
    clientTxnId: { $regex: /^ORDER_/ },
    createdAt: { $gte: cutoff },
    $or: [
      { 'paymentDetails.gatewayAmount': { $gt: 0 } },
      { gatewayOrderId: { $exists: true, $nin: [null, ''] } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  const results = [];

  for (const order of pendingOrders) {
    try {
      const recovery = await recoverPendingOrderPayment(order, {
        maxAttempts: 2,
        delayMs: 500,
        logSource: 'recover-api',
      });
      results.push({
        orderId: order._id,
        clientTxnId: order.clientTxnId,
        confirmed: !!recovery.confirmed,
        paymentStatus: recovery.paymentStatus || (recovery.confirmed ? 'SUCCESS' : 'PENDING'),
        alreadyProcessed: !!recovery.alreadyProcessed,
      });
    } catch (err) {
      results.push({
        orderId: order._id,
        clientTxnId: order.clientTxnId,
        confirmed: false,
        error: err.message,
      });
    }
  }

  const confirmed = results.filter((r) => r.confirmed && !r.alreadyProcessed).length;

  return NextResponse.json({
    success: true,
    scanned: pendingOrders.length,
    recovered: confirmed,
    lookbackMinutes,
    results,
  });
}

export async function GET(request) {
  return POST(request);
}
