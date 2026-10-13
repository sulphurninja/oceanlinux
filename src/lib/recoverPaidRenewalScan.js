import Order from '@/models/orderModel';
import { probeRazorpayOrderPaid, completeRenewalViaWebhook, recoverOrphanPaidRazorpayRenewals } from '@/lib/completePaidRenewal';
import { lookupRazorpayRenewalByReceipt } from '@/lib/renewalOrderLookup';

async function razorpayRenewalIsPaid(pendingRenewal) {
  const gatewayOrderId = String(pendingRenewal?.gatewayOrderId || '').trim();
  if (gatewayOrderId) {
    const direct = await probeRazorpayOrderPaid(gatewayOrderId);
    if (direct.paid) return direct;
  }

  const renewalTxnId = String(pendingRenewal?.renewalTxnId || '').trim();
  if (!renewalTxnId.startsWith('RENEWAL_')) return { paid: false };

  const meta = await lookupRazorpayRenewalByReceipt(renewalTxnId);
  if (meta?.paid && meta.razorpayOrderId) {
    return probeRazorpayOrderPaid(meta.razorpayOrderId);
  }

  return { paid: false };
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

  for (const order of pendingRenewalOrders) {
    const renewalTxnId = order.pendingRenewal?.renewalTxnId;
    if (!renewalTxnId) continue;

    try {
      const already = order.renewalPayments?.some((rp) => rp.renewalTxnId === renewalTxnId);
      if (already) continue;

      const paid = await razorpayRenewalIsPaid(order.pendingRenewal);
      if (!paid.paid) continue;

      const completion = await completeRenewalViaWebhook(renewalTxnId, {
        paymentId: paid.paymentId,
        amountInr: paid.amountInr,
        paymentMethod: 'razorpay',
        logSource,
      });

      if (completion.success) {
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
          reason: completion.body?.message || 'renewal_webhook_failed',
        });
      }
    } catch (err) {
      errors.push({ orderId: String(order._id), renewalTxnId, error: err.message });
    }
  }

  const orphanScan = await recoverOrphanPaidRazorpayRenewals({ since, limit, logSource });
  recovered.push(...orphanScan.recovered);
  anomalies.push(...orphanScan.anomalies);
  errors.push(...(orphanScan.errors || []));

  return {
    scanned: pendingRenewalOrders.length + orphanScan.scanned,
    recovered,
    anomalies,
    errors,
  };
}
