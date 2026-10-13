/**
 * Server-side renewal completion when gateway payment is already captured
 * (webhook miss, UPI Intent without return, modal dismiss clearing pendingRenewal).
 */

import Order from '@/models/orderModel';
import { getRazorpayClient } from '@/lib/razorpayClient';
import {
  lookupRazorpayRenewalByReceipt,
  resolveOrderForRenewalTransaction,
} from '@/lib/renewalOrderLookup';

export async function probeRazorpayOrderPaid(gatewayOrderId) {
  const id = String(gatewayOrderId || '').trim();
  if (!id) return { paid: false };

  const razorpay = getRazorpayClient();
  if (!razorpay) return { paid: false, reason: 'razorpay_unconfigured' };

  const razorpayOrder = await razorpay.orders.fetch(id);
  if (razorpayOrder.status !== 'paid') {
    const payments = await razorpay.orders.fetchPayments(id);
    const captured = payments.items?.find((p) => p.status === 'captured');
    if (!captured) {
      return { paid: false, status: razorpayOrder.status };
    }
    return {
      paid: true,
      paymentId: captured.id,
      amountInr: Number(captured.amount ?? razorpayOrder.amount) / 100,
      receipt: razorpayOrder.receipt,
      gatewayOrderId: id,
    };
  }

  const payments = await razorpay.orders.fetchPayments(id);
  const captured = payments.items?.find((p) => p.status === 'captured');
  return {
    paid: true,
    paymentId: captured?.id || id,
    amountInr: Number(captured?.amount ?? razorpayOrder.amount) / 100,
    receipt: razorpayOrder.receipt,
    gatewayOrderId: id,
  };
}

async function parseRenewalWebhookResult(res) {
  const httpOk = res?.status === 200 || res?.status === undefined;
  let body = {};
  try {
    body = typeof res?.json === 'function' ? await res.json() : res || {};
  } catch {
    body = {};
  }
  return {
    success: httpOk && body?.success !== false,
    alreadyProcessed: !!body?.alreadyProcessed,
    body,
  };
}

/**
 * Run handleRenewalWebhook (idempotent).
 */
export async function completeRenewalViaWebhook(
  renewalTxnId,
  { paymentId, amountInr, paymentMethod = 'razorpay', logSource = 'auto' } = {}
) {
  const txnId = String(renewalTxnId || '').trim();
  if (!txnId.startsWith('RENEWAL_')) {
    return { success: false, reason: 'invalid_renewal_txn_id' };
  }

  const existing = await Order.findOne({ 'renewalPayments.renewalTxnId': txnId }).select('_id');
  if (existing) {
    return { success: true, alreadyProcessed: true, orderId: String(existing._id), logSource };
  }

  const { handleRenewalWebhook } = await import('@/app/api/payment/webhook/route.js');
  const adaptedPayment = {
    order: { order_id: txnId },
    payment: {
      cf_payment_id: paymentId || txnId,
      payment_amount: Number(amountInr) || 0,
      payment_status: 'SUCCESS',
      payment_method: paymentMethod,
    },
  };

  const res = await handleRenewalWebhook(txnId, adaptedPayment, Date.now());
  const parsed = await parseRenewalWebhookResult(res);
  return { ...parsed, logSource, renewalTxnId: txnId };
}

/**
 * Before cancelling pending renewal — complete if Razorpay already captured.
 */
export async function tryRecoverPaidRenewalForOrder(order) {
  if (!order?._id) return { recovered: false };

  const pending = order.pendingRenewal?.toObject?.() || order.pendingRenewal;
  const renewalTxnId = String(pending?.renewalTxnId || '').trim();
  if (!renewalTxnId) return { recovered: false };

  const already = order.renewalPayments?.some((rp) => rp.renewalTxnId === renewalTxnId);
  if (already) {
    return { recovered: true, alreadyProcessed: true, orderId: String(order._id), renewalTxnId };
  }

  let paid = null;
  const gatewayOrderId = String(pending.gatewayOrderId || '').trim();
  if (gatewayOrderId) {
    paid = await probeRazorpayOrderPaid(gatewayOrderId);
  }
  if (!paid?.paid) {
    const meta = await lookupRazorpayRenewalByReceipt(renewalTxnId);
    if (meta?.paid && meta.razorpayOrderId) {
      paid = await probeRazorpayOrderPaid(meta.razorpayOrderId);
    }
  }

  if (!paid?.paid) return { recovered: false, renewalTxnId };

  const result = await completeRenewalViaWebhook(renewalTxnId, {
    paymentId: paid.paymentId,
    amountInr: paid.amountInr,
    paymentMethod: 'razorpay',
    logSource: 'cancel-recover',
  });

  if (result.success) {
    return {
      recovered: true,
      alreadyProcessed: !!result.alreadyProcessed,
      orderId: String(order._id),
      renewalTxnId,
      paymentId: paid.paymentId,
    };
  }

  return { recovered: false, renewalTxnId, reason: result.body?.message || result.reason };
}

/**
 * When pendingRenewal was cleared but RENEWAL_* payment exists on Razorpay.
 */
export async function tryRecoverPaidRenewalByTxnId(renewalTxnId, orderIdHint = null) {
  const txnId = String(renewalTxnId || '').trim();
  if (!txnId.startsWith('RENEWAL_')) return { recovered: false };

  const existing = await Order.findOne({ 'renewalPayments.renewalTxnId': txnId }).select('_id');
  if (existing) {
    return { recovered: true, alreadyProcessed: true, orderId: String(existing._id), renewalTxnId: txnId };
  }

  const meta = await lookupRazorpayRenewalByReceipt(txnId);
  if (!meta?.paid || !meta.razorpayOrderId) {
    return { recovered: false, renewalTxnId: txnId };
  }

  const order = await resolveOrderForRenewalTransaction({
    renewalTxnId: txnId,
    orderIdHint: orderIdHint || meta.mongoOrderId || null,
  });
  if (!order) return { recovered: false, renewalTxnId: txnId, reason: 'order_not_found' };

  const paid = await probeRazorpayOrderPaid(meta.razorpayOrderId);
  if (!paid?.paid) return { recovered: false, renewalTxnId: txnId };

  const result = await completeRenewalViaWebhook(txnId, {
    paymentId: paid.paymentId,
    amountInr: paid.amountInr,
    paymentMethod: 'razorpay',
    logSource: 'orphan-txn-recover',
  });

  if (result.success) {
    return {
      recovered: true,
      alreadyProcessed: !!result.alreadyProcessed,
      orderId: String(order._id),
      renewalTxnId: txnId,
      paymentId: paid.paymentId,
    };
  }

  return { recovered: false, renewalTxnId: txnId, reason: result.body?.message || result.reason };
}

/**
 * Paid Razorpay orders with RENEWAL_* receipt not yet in renewalPayments (pending cleared).
 */
export async function recoverOrphanPaidRazorpayRenewals({
  since,
  limit = 40,
  logSource = 'orphan-scan',
} = {}) {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return { scanned: 0, recovered: [], anomalies: [], errors: [{ error: 'razorpay_unconfigured' }] };
  }

  const from = Math.floor(
    (since ? new Date(since).getTime() : Date.now() - 72 * 60 * 60 * 1000) / 1000
  );
  const recovered = [];
  const anomalies = [];
  const errors = [];
  let scanned = 0;

  try {
    const listed = await razorpay.orders.all({ from, count: Math.min(limit, 100) });
    const items = (listed.items || []).filter(
      (o) => o.receipt && String(o.receipt).startsWith('RENEWAL_')
    );

    for (const item of items) {
      if (scanned >= limit) break;
      scanned += 1;
      const receipt = String(item.receipt);

      try {
        const done = await Order.findOne({ 'renewalPayments.renewalTxnId': receipt }).select('_id');
        if (done) continue;

        const paid = await probeRazorpayOrderPaid(item.id);
        if (!paid?.paid) continue;

        const result = await completeRenewalViaWebhook(receipt, {
          paymentId: paid.paymentId,
          amountInr: paid.amountInr,
          paymentMethod: 'razorpay',
          logSource,
        });

        if (result.success) {
          recovered.push({
            kind: 'renewal_orphan',
            renewalTxnId: receipt,
            razorpayOrderId: item.id,
            paymentId: paid.paymentId,
            logSource,
          });
        } else {
          anomalies.push({
            kind: 'renewal_orphan',
            renewalTxnId: receipt,
            razorpayOrderId: item.id,
            reason: result.body?.message || 'renewal_webhook_failed',
          });
        }
      } catch (err) {
        errors.push({ renewalTxnId: receipt, error: err.message });
      }
    }
  } catch (err) {
    errors.push({ error: err.message });
  }

  return { scanned, recovered, anomalies, errors };
}
