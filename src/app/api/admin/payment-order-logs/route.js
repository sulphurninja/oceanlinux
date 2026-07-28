import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PaymentOrderLog from '@/models/paymentOrderLogModel';
import Order from '@/models/orderModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { probeGatewayPayment, confirmPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import {
  recoverPendingCheckoutSession,
  recoverPendingWalletRecharge,
} from '@/lib/paymentDispatch';
const PaymentOrderLogger = require('@/services/paymentOrderLogger');

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
    try {
      const body = await request.json();
      if (body?.hours) hours = Math.min(Math.max(Number(body.hours) || 48, 1), 168);
      if (body?.recover === false) autoRecover = false;
    } catch {
      /* empty body ok */
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const anomalies = [];
    const recovered = [];

    // Buy-now orders only — cart child rows (CART_*-0) have no gatewayOrderId.
    const pendingOrders = await Order.find({
      status: 'pending',
      clientTxnId: { $regex: /^ORDER_/ },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    for (const orderDoc of pendingOrders) {
      const order = await Order.findById(orderDoc._id);
      if (!order || order.status !== 'pending') continue;

      let probe;
      try {
        probe = await probeGatewayPayment(order);
      } catch {
        continue;
      }

      if (!probe.success) continue;

      if (autoRecover) {
        const result = await confirmPendingOrderPayment(order, probe, { logSource: 'scan' });
        if (result.confirmed) {
          recovered.push({
            orderId: String(order._id),
            clientTxnId: order.clientTxnId,
            productName: order.productName,
            gatewayMethod: probe.method,
            transactionId: probe.transactionId,
            alreadyProcessed: !!result.alreadyProcessed,
          });
          continue;
        }
      }

      const logger = PaymentOrderLogger.forOrder(order, 'scan');
      logger.warning('Admin scan: gateway shows PAID but order still pending', {
        clientTxnId: order.clientTxnId,
        productName: order.productName,
        price: order.price,
        gatewayMethod: probe.method,
        transactionId: probe.transactionId,
        autoRecoverAttempted: autoRecover,
      });
      logger.setPaymentInfo({
        method: probe.method,
        gatewayStatus: 'SUCCESS',
        transactionId: probe.transactionId,
        gatewayOrderId: probe.gatewayOrderId,
      });
      const saved = await logger.save({
        success: false,
        anomaly: true,
        errorMessage: autoRecover ? 'paid_but_order_pending_scan_recover_failed' : 'paid_but_order_pending_scan',
      });

      anomalies.push({
        orderId: String(order._id),
        clientTxnId: order.clientTxnId,
        productName: order.productName,
        price: order.price,
        createdAt: order.createdAt,
        gatewayMethod: probe.method,
        transactionId: probe.transactionId,
        logId: saved?._id ? String(saved._id) : null,
      });
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
      .limit(100);

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
        } else {
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
      .limit(100);

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
        } else {
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
    const totalAnomalies =
      anomalies.length + cartsAnomalies.length + rechargesAnomalies.length;

    return NextResponse.json({
      success: true,
      scanned: pendingOrders.length,
      scannedCarts: pendingSessions.length,
      scannedRecharges: pendingRecharges.length,
      hours,
      autoRecover,
      recoveredCount: totalRecovered,
      recovered,
      cartsRecovered,
      rechargesRecovered,
      anomalyCount: totalAnomalies,
      anomalies,
      cartsAnomalies,
      rechargesAnomalies,
    });
  } catch (error) {
    console.error('[PAYMENT-ORDER-LOGS] POST scan error:', error);
    return NextResponse.json(
      { success: false, message: 'Scan failed', error: error.message },
      { status: 500 }
    );
  }
}
