import Order from '@/models/orderModel';
import { getRazorpayClient } from '@/lib/razorpayClient';

async function razorpayRenewalIsPaid(pendingRenewal) {
  const gatewayOrderId = String(pendingRenewal?.gatewayOrderId || '').trim();
  if (!gatewayOrderId || pendingRenewal?.paymentMethod !== 'razorpay') {
    return { paid: false };
  }
  const razorpay = getRazorpayClient();
  if (!razorpay) return { paid: false, reason: 'razorpay_unconfigured' };

  const razorpayOrder = await razorpay.orders.fetch(gatewayOrderId);
  if (razorpayOrder.status !== 'paid') return { paid: false, status: razorpayOrder.status };

  const payments = await razorpay.orders.fetchPayments(gatewayOrderId);
  const captured = payments.items?.find((p) => p.status === 'captured');
  return {
    paid: true,
    paymentId: captured?.id || gatewayOrderId,
    amountInr: Number(captured?.amount ?? razorpayOrder.amount) / 100,
  };
}

/**
 * Find pendingRenewal rows whose Razorpay order is already paid and run renewal webhook logic.
 */
export async function recoverPaidRenewalsInScan({ since, limit = 50, logSource = 'scan' } = {}) {
  const pendingRenewalOrders = await Order.find({
    'pendingRenewal.renewalTxnId': { $exists: true, $nin: [null, ''] },
    'pendingRenewal.initiatedAt': { $gte: since },
  })
    .sort({ 'pendingRenewal.initiatedAt': -1 })
    .limit(limit);

  const recovered = [];
  const anomalies = [];
  const errors = [];

  if (!pendingRenewalOrders.length) {
    return { scanned: 0, recovered, anomalies, errors };
  }

  const { handleRenewalWebhook } = await import('@/app/api/payment/webhook/route.js');

  for (const order of pendingRenewalOrders) {
    const renewalTxnId = order.pendingRenewal?.renewalTxnId;
    if (!renewalTxnId) continue;

    try {
      const already = order.renewalPayments?.some((rp) => rp.renewalTxnId === renewalTxnId);
      if (already) continue;

      const paid = await razorpayRenewalIsPaid(order.pendingRenewal);
      if (!paid.paid) continue;

      const adaptedPayment = {
        order: { order_id: renewalTxnId },
        payment: {
          cf_payment_id: paid.paymentId,
          payment_amount: paid.amountInr,
          payment_status: 'SUCCESS',
          payment_method: 'razorpay',
        },
      };

      const res = await handleRenewalWebhook(renewalTxnId, adaptedPayment, Date.now());
      const ok = res?.status === 200 || res?.status === undefined;
      let body = {};
      try {
        body = typeof res?.json === 'function' ? await res.json() : res;
      } catch {
        body = {};
      }

      if (ok && body?.success !== false) {
        recovered.push({
          kind: 'renewal',
          orderId: String(order._id),
          renewalTxnId,
          ipAddress: order.ipAddress,
          paymentId: paid.paymentId,
          logSource,
        });
      } else {
        anomalies.push({
          kind: 'renewal',
          orderId: String(order._id),
          renewalTxnId,
          reason: body?.message || 'renewal_webhook_failed',
        });
      }
    } catch (err) {
      errors.push({ orderId: String(order._id), renewalTxnId, error: err.message });
    }
  }

  return { scanned: pendingRenewalOrders.length, recovered, anomalies, errors };
}
