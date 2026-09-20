import Order from '@/models/orderModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { recoverPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import {
  recoverPendingCheckoutSession,
  recoverPendingWalletRecharge,
} from '@/lib/paymentDispatch';
import { recoverPaidRenewalsInScan } from '@/lib/recoverPaidRenewalScan';

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

/**
 * Same logic as admin Status → "Scan paid-but-pending".
 * @param {{ hours?: number, limit?: number, autoRecover?: boolean, logSource?: string }} opts
 */
export async function runPaidButPendingScan(opts = {}) {
  const hours = Math.min(Math.max(Number(opts.hours) || 72, 1), 168);
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const autoRecover = opts.autoRecover !== false;
  const logSource = opts.logSource || 'scan';

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const anomalies = [];
  const recovered = [];
  const scanErrors = [];

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
        logSource,
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

  let renewalsRecovered = [];
  let renewalsAnomalies = [];
  let renewalsScanned = 0;
  let renewalScanErrors;

  if (autoRecover) {
    const renewalScan = await recoverPaidRenewalsInScan({ since, limit, logSource });
    renewalsScanned = renewalScan.scanned;
    renewalsRecovered = renewalScan.recovered;
    renewalsAnomalies = renewalScan.anomalies;
    renewalScanErrors = renewalScan.errors;
  }

  const totalRecovered =
    recovered.length + cartsRecovered.length + rechargesRecovered.length + renewalsRecovered.length;
  const totalAnomalies =
    anomalies.length + cartsAnomalies.length + rechargesAnomalies.length + renewalsAnomalies.length;

  return {
    success: true,
    scanned: pendingOrders.length,
    scannedCarts: pendingSessions.length,
    scannedRecharges: pendingRecharges.length,
    scannedRenewals: renewalsScanned,
    hours,
    limit,
    autoRecover,
    logSource,
    recoveredCount: totalRecovered,
    recovered,
    cartsRecovered,
    rechargesRecovered,
    renewalsRecovered,
    renewalsAnomalies,
    anomalyCount: totalAnomalies,
    orderAnomalyCount: anomalies.length,
    anomalies,
    cartsAnomalies,
    rechargesAnomalies,
    errors:
      scanErrors.length || renewalScanErrors?.length
        ? [...scanErrors, ...(renewalScanErrors || [])]
        : undefined,
  };
}
