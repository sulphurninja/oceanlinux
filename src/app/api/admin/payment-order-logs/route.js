import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PaymentOrderLog from '@/models/paymentOrderLogModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { runPaidButPendingScan } from '@/lib/paidButPendingScan';

/** Gateway probes are slow (~1s/order); allow full batch on PM2/Vercel. */
export const maxDuration = 300;

/** Old bulk-scan rows for unpaid orders — hide from default log list. */
const SCAN_UNPAID_NOISE = ['PENDING', 'ATTEMPTED', 'CREATED', 'pending', 'attempted', 'created'];

function applyScanNoiseFilter(filters, includeScanNoise) {
  if (includeScanNoise) return filters;
  const noiseFilter = {
    source: { $in: ['scan', 'scan-cron', 'recover-api'] },
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

    let hours = 72;
    let autoRecover = true;
    let limit = 40;
    try {
      const body = await request.json();
      if (body?.hours) hours = Math.min(Math.max(Number(body.hours) || 72, 1), 168);
      if (body?.recover === false) autoRecover = false;
      if (body?.limit) limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);
    } catch {
      /* empty body ok */
    }

    const result = await runPaidButPendingScan({
      hours,
      limit,
      autoRecover,
      logSource: 'scan',
    });

    return NextResponse.json(result);
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
