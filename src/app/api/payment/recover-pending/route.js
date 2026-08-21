import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { recoverPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import {
  recoverPendingCheckoutSession,
  recoverPendingWalletRecharge,
} from '@/lib/paymentDispatch';
import { enforceCronSecret } from '@/lib/apiSecurity';

/**
 * POST /api/payment/recover-pending
 *
 * Reconcile missed payment confirmations:
 *   - Buy-now orders (ORDER_*)
 *   - Cart checkouts (CART_* CheckoutSession)
 *   - Wallet recharges (WALLET_*)
 *
 * Query: ?minutes=120&limit=30
 * Auth: CRON_SECRET required
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  await connectDB();

  const url = new URL(request.url);
  const lookbackMinutes = Math.max(10, Number(url.searchParams.get('minutes')) || 120);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  // Reset stuck mid-confirm locks. Never reopen a recharge that already has
  // walletTxnId — that money is already in the wallet; mark it confirmed.
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000);
  await CheckoutSession.updateMany(
    { status: 'processing', updatedAt: { $lt: stuckCutoff } },
    { $set: { status: 'pending' } }
  );
  await WalletRecharge.updateMany(
    {
      status: 'processing',
      updatedAt: { $lt: stuckCutoff },
      walletTxnId: { $exists: true, $nin: [null, ''] },
    },
    { $set: { status: 'confirmed', creditedAt: new Date() } }
  );
  await WalletRecharge.updateMany(
    {
      status: 'processing',
      updatedAt: { $lt: stuckCutoff },
      $or: [{ walletTxnId: null }, { walletTxnId: '' }, { walletTxnId: { $exists: false } }],
    },
    { $set: { status: 'pending' } }
  );

  const orderResults = [];
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

  for (const order of pendingOrders) {
    try {
      const recovery = await recoverPendingOrderPayment(order, {
        maxAttempts: 2,
        delayMs: 500,
        logSource: 'recover-api',
        quiet: true,
      });
      orderResults.push({
        kind: 'order',
        orderId: order._id,
        clientTxnId: order.clientTxnId,
        confirmed: !!recovery.confirmed,
        paymentStatus: recovery.paymentStatus || (recovery.confirmed ? 'SUCCESS' : 'PENDING'),
        alreadyProcessed: !!recovery.alreadyProcessed,
      });
    } catch (err) {
      orderResults.push({
        kind: 'order',
        orderId: order._id,
        clientTxnId: order.clientTxnId,
        confirmed: false,
        error: err.message,
      });
    }
  }

  const cartResults = [];
  const pendingSessions = await CheckoutSession.find({
    status: { $in: ['pending', 'failed', 'cancelled'] },
    clientTxnId: { $regex: /^CART_/ },
    createdAt: { $gte: cutoff },
    gatewayAmount: { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  for (const session of pendingSessions) {
    try {
      const recovery = await recoverPendingCheckoutSession(session, {
        maxAttempts: 2,
        delayMs: 500,
      });
      cartResults.push({
        kind: 'cart',
        sessionId: session._id,
        clientTxnId: session.clientTxnId,
        confirmed: !!recovery.success,
        alreadyProcessed: !!recovery.alreadyProcessed,
        reason: recovery.reason,
      });
    } catch (err) {
      cartResults.push({
        kind: 'cart',
        sessionId: session._id,
        clientTxnId: session.clientTxnId,
        confirmed: false,
        error: err.message,
      });
    }
  }

  const rechargeResults = [];
  const pendingRecharges = await WalletRecharge.find({
    status: 'pending',
    clientTxnId: { $regex: /^WALLET_/ },
    createdAt: { $gte: cutoff },
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  for (const recharge of pendingRecharges) {
    try {
      const recovery = await recoverPendingWalletRecharge(recharge, {
        maxAttempts: 2,
        delayMs: 500,
      });
      rechargeResults.push({
        kind: 'recharge',
        rechargeId: recharge._id,
        clientTxnId: recharge.clientTxnId,
        confirmed: !!recovery.success,
        alreadyProcessed: !!recovery.alreadyProcessed,
        reason: recovery.reason,
      });
    } catch (err) {
      rechargeResults.push({
        kind: 'recharge',
        rechargeId: recharge._id,
        clientTxnId: recharge.clientTxnId,
        confirmed: false,
        error: err.message,
      });
    }
  }

  const ordersRecovered = orderResults.filter((r) => r.confirmed && !r.alreadyProcessed).length;
  const cartsRecovered = cartResults.filter((r) => r.confirmed && !r.alreadyProcessed).length;
  const rechargesRecovered = rechargeResults.filter((r) => r.confirmed && !r.alreadyProcessed).length;

  return NextResponse.json({
    success: true,
    lookbackMinutes,
    orders: { scanned: pendingOrders.length, recovered: ordersRecovered, results: orderResults },
    carts: { scanned: pendingSessions.length, recovered: cartsRecovered, results: cartResults },
    recharges: { scanned: pendingRecharges.length, recovered: rechargesRecovered, results: rechargeResults },
    totalRecovered: ordersRecovered + cartsRecovered + rechargesRecovered,
  });
}

export async function GET(request) {
  return POST(request);
}
