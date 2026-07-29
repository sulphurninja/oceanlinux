import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PaymentOrderLog from '@/models/paymentOrderLogModel';
import Order from '@/models/orderModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { recoverPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import {
  recoverPendingCheckoutSession,
  recoverPendingWalletRecharge,
} from '@/lib/paymentDispatch';

/** Gateway probes are slow (~1s/order); allow full batch on PM2/Vercel. */
export const maxDuration = 300;

/** Cart/recharge recovery failures that are normal unpaid — not gateway-paid anomalies. */
function isNormalUnpaidRecovery(reason) {
  const r = String(reason || '').toLowerCase();
  return (
    !r ||
    r === 'payment not verified' ||
    r === 'not paid' ||
    r === 'pending' ||
    r === 'created' ||
    r === 'attempted'
  );
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err.message };
      }
    }
  }

  const workers = Math.min(Math.max(concurrency, 1), items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Old bulk-scan rows for unpaid orders — hide from default log list. */
const SCAN_UNPAID_NOISE = ['PENDING', 'ATTEMPTED', 'CREATED', 'pending', 'attempted', 'created'];

function applyScanNoiseFilter(filters, includeScanNoise) {
  if (includeScanNoise) return filters;
  const noiseFilter = {
    source: { $in: ['scan', 'recover-api'] },
    anomaly: { $ne: true },
    success: false,
    errorMessage: { $in: SCAN_UNPAID_NOISE },
  };
  if (filters.$and) {
    filters.$and.push({ $nor: [noiseFilter] });
  } else if (filters.$nor) {
    filters.$nor.push(noiseFilter);
  } else {
    filters.$nor = [noiseFilter];
  }
  return filters;
}

export async function GET(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const filters = {};

    const orderId = searchParams.get('orderId');
    if (orderId) filters.orderId = orderId;

    const clientTxnId = searchParams.get('clientTxnId');
    if (clientTxnId) filters.clientTxnId = clientTxnId;

    const anomaly = searchParams.get('anomaly');
    if (anomaly === 'true') filters.anomaly = true;
    if (anomaly === 'false') filters.anomaly = false;

    const source = searchParams.get('source');
    if (source) filters.source = source;

    const success = searchParams.get('success');
    if (success === 'true') filters.success = true;
    if (success === 'false') filters.success = false;

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const includeScanNoise = searchParams.get('includeScanNoise') === 'true';

    // Hide pre-fix scan spam (unpaid PENDING/ATTEMPTED) unless explicitly requested.
    if (!clientTxnId) {
      applyScanNoiseFilter(filters, includeScanNoise);
    }

    const [logs, totalCount, summaryAgg] = await Promise.all([
      PaymentOrderLog.find(filters).sort({ createdAt: -1 }).limit(limit).skip(offset).lean(),
      PaymentOrderLog.countDocuments(filters),
      PaymentOrderLog.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            successCount: { $sum: { $cond: ['$success', 1, 0] } },
            anomalyCount: { $sum: { $cond: ['$anomaly', 1, 0] } },
            failedCount: {
              $sum: { $cond: [{ $and: [{ $eq: ['$success', false] }, { $eq: ['$anomaly', false] }] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const summary = summaryAgg[0] || {
      total: 0,
      successCount: 0,
      anomalyCount: 0,
      failedCount: 0,
    };

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      summary,
    });
  } catch (error) {
    console.error('[PAYMENT-ORDER-LOGS] GET error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', error: error.message },
      { status: 500 }
    );
  }
}

/** Scan recent pending orders — flag gateway-paid but still pending */
export async function POST(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    let hours = 48;
    let autoRecover = true;
    let limit = 40;
    try {
      const body = await request.json();
      if (body?.hours) hours = Math.min(Math.max(Number(body.hours) || 48, 1), 168);
      if (body?.recover === false) autoRecover = false;
      if (body?.limit) limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);
    } catch {
      /* empty body ok */
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const anomalies = [];
    const recovered = [];
    const scanErrors = [];

    // Buy-now orders only — skip rows that never reached a gateway (same as recover-pending cron).
    const pendingOrders = await Order.find({
      status: 'pending',
      clientTxnId: { $regex: /^ORDER_/ },
      createdAt: { $gte: since },
      $or: [
        { 'paymentDetails.gatewayAmount': { $gt: 0 } },
        { gatewayOrderId: { $exists: true, $nin: [null, ''] } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    const orderResults = await mapWithConcurrency(pendingOrders, 6, async (order) => {
      try {
        if (!order || order.status !== 'pending') return null;

        if (!autoRecover) {
          return { kind: 'order', clientTxnId: order.clientTxnId, skipped: true };
        }

        const result = await recoverPendingOrderPayment(order, {
          maxAttempts: 2,
          delayMs: 400,
          logSource: 'scan',
          quiet: true,
        });

        if (result.confirmed) {
          return {
            kind: 'order',
            recovered: true,
            orderId: String(order._id),
            clientTxnId: order.clientTxnId,
            productName: order.productName,
            alreadyProcessed: !!result.alreadyProcessed,
          };
        }

        if (result.anomaly) {
          return {
            kind: 'order',
            anomaly: true,
            orderId: String(order._id),
            clientTxnId: order.clientTxnId,
            productName: order.productName,
            price: order.price,
            createdAt: order.createdAt,
            reason: result.reason || result.paymentStatus,
          };
        }

        return null;
      } catch (err) {
        return { error: err.message, clientTxnId: order?.clientTxnId };
      }
    });

    for (const row of orderResults) {
      if (!row) continue;
      if (row.error) {
        scanErrors.push({ clientTxnId: row.clientTxnId, error: row.error });
        continue;
      }
      if (row.recovered) {
        recovered.push(row);
        continue;
      }
      if (row.anomaly) {
        anomalies.push(row);
      }
    }

    const cartsRecovered = [];
    const cartsAnomalies = [];
    const pendingSessions = await CheckoutSession.find({
      status: { $in: ['pending', 'failed', 'cancelled'] },
      clientTxnId: { $regex: /^CART_/ },
      createdAt: { $gte: since },
      gatewayAmount: { $gt: 0 },
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    for (const session of pendingSessions) {
      if (!autoRecover) {
        cartsAnomalies.push({
          kind: 'cart',
          sessionId: String(session._id),
          clientTxnId: session.clientTxnId,
          customerEmail: session.customerEmail,
        });
        continue;
      }

      try {
        const result = await recoverPendingCheckoutSession(session, {
          maxAttempts: 2,
          delayMs: 500,
        });
        if (result.success) {
          cartsRecovered.push({
            kind: 'cart',
            sessionId: String(session._id),
            clientTxnId: session.clientTxnId,
            customerEmail: session.customerEmail,
            orderIds: result.orderIds?.map(String) || [],
            alreadyProcessed: !!result.alreadyProcessed,
          });
        } else if (!isNormalUnpaidRecovery(result.reason)) {
          cartsAnomalies.push({
            kind: 'cart',
            sessionId: String(session._id),
            clientTxnId: session.clientTxnId,
            customerEmail: session.customerEmail,
            reason: result.reason,
          });
        }
      } catch (err) {
        cartsAnomalies.push({
          kind: 'cart',
          sessionId: String(session._id),
          clientTxnId: session.clientTxnId,
          customerEmail: session.customerEmail,
          reason: err.message,
        });
      }
    }

    const rechargesRecovered = [];
    const rechargesAnomalies = [];
    const pendingRecharges = await WalletRecharge.find({
      status: 'pending',
      clientTxnId: { $regex: /^WALLET_/ },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    for (const recharge of pendingRecharges) {
      if (!autoRecover) {
        rechargesAnomalies.push({
          kind: 'recharge',
          rechargeId: String(recharge._id),
          clientTxnId: recharge.clientTxnId,
          amount: recharge.amount,
        });
        continue;
      }

      try {
        const result = await recoverPendingWalletRecharge(recharge, {
          maxAttempts: 2,
          delayMs: 500,
        });
        if (result.success) {
          rechargesRecovered.push({
            kind: 'recharge',
            rechargeId: String(recharge._id),
            clientTxnId: recharge.clientTxnId,
            amount: recharge.amount,
            newBalance: result.newBalance,
            alreadyProcessed: !!result.alreadyProcessed,
          });
        } else if (!isNormalUnpaidRecovery(result.reason)) {
          rechargesAnomalies.push({
            kind: 'recharge',
            rechargeId: String(recharge._id),
            clientTxnId: recharge.clientTxnId,
            amount: recharge.amount,
            reason: result.reason,
          });
        }
      } catch (err) {
        rechargesAnomalies.push({
          kind: 'recharge',
          rechargeId: String(recharge._id),
          clientTxnId: recharge.clientTxnId,
          amount: recharge.amount,
          reason: err.message,
        });
      }
    }

    const totalRecovered =
      recovered.length + cartsRecovered.length + rechargesRecovered.length;
    /** Only gateway-paid-but-still-pending — not unpaid cart/recharge checkouts. */
    const totalAnomalies =
      anomalies.length + cartsAnomalies.length + rechargesAnomalies.length;
    const orderAnomalyCount = anomalies.length;

    return NextResponse.json({
      success: true,
      scanned: pendingOrders.length,
      scannedCarts: pendingSessions.length,
      scannedRecharges: pendingRecharges.length,
      hours,
      limit,
      autoRecover,
      recoveredCount: totalRecovered,
      recovered,
      cartsRecovered,
      rechargesRecovered,
      anomalyCount: totalAnomalies,
      orderAnomalyCount,
      anomalies,
      cartsAnomalies,
      rechargesAnomalies,
      errors: scanErrors.length ? scanErrors : undefined,
    });
  } catch (error) {
    console.error('[PAYMENT-ORDER-LOGS] POST scan error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message?.includes('timeout')
          ? 'Scan timed out — try again or reduce hours/limit'
          : 'Scan failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
