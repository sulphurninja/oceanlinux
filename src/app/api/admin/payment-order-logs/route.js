import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PaymentOrderLog from '@/models/paymentOrderLogModel';
import Order from '@/models/orderModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { probeGatewayPayment, confirmPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
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
    const pendingOrders = await Order.find({
      status: 'pending',
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const anomalies = [];
    const recovered = [];

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

    return NextResponse.json({
      success: true,
      scanned: pendingOrders.length,
      hours,
      autoRecover,
      recoveredCount: recovered.length,
      recovered,
      anomalyCount: anomalies.length,
      anomalies,
    });
  } catch (error) {
    console.error('[PAYMENT-ORDER-LOGS] POST scan error:', error);
    return NextResponse.json(
      { success: false, message: 'Scan failed', error: error.message },
      { status: 500 }
    );
  }
}
