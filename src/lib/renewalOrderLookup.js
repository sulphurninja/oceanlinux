/**
 * Renewal payment race fixes — find orders when pendingRenewal was overwritten,
 * reuse open gateway sessions, and align pendingRenewal before confirm.
 */

import Order from '@/models/orderModel';
import { getRazorpayClient } from '@/lib/razorpayClient';
import { resolveOrderRenewalPrice } from '@/lib/orderRenewalPricingServer';

const PENDING_REUSE_MAX_MS = 45 * 60 * 1000;
const RAZORPAY_RECEIPT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

async function razorpayOrderHasCapturedPayment(razorpay, razorpayOrderId) {
  if (!razorpay || !razorpayOrderId) return false;
  try {
    const rzpOrder = await razorpay.orders.fetch(razorpayOrderId);
    if (rzpOrder.status === 'paid') return true;
    const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
    return !!payments.items?.find((p) => p.status === 'captured');
  } catch {
    return false;
  }
}

/**
 * Find Razorpay order whose receipt equals renewalTxnId (RENEWAL_*).
 */
export async function lookupRazorpayRenewalByReceipt(renewalTxnId) {
  const receipt = String(renewalTxnId || '').trim();
  if (!receipt.startsWith('RENEWAL_')) return null;

  const razorpay = getRazorpayClient();
  if (!razorpay) return null;

  const from = Math.floor((Date.now() - RAZORPAY_RECEIPT_LOOKBACK_MS) / 1000);
  let skip = 0;
  const count = 100;

  for (let page = 0; page < 20; page++) {
    const listed = await razorpay.orders.all({ from, count, skip });
    const items = listed.items || [];
    const match = items.find((o) => o.receipt === receipt);
    if (match) {
      const notes = match.notes || {};
      const paid = match.status === 'paid' || (await razorpayOrderHasCapturedPayment(razorpay, match.id));
      return {
        razorpayOrderId: match.id,
        status: match.status,
        paid,
        amountPaise: Number(match.amount_paid || match.amount) || 0,
        mongoOrderId: notes.order_id ? String(notes.order_id) : '',
        notes,
        receipt,
      };
    }
    if (items.length < count) break;
    skip += count;
  }

  return null;
}

/**
 * Resolve service order for a renewal transaction (survives pendingRenewal overwrite).
 */
export async function resolveOrderForRenewalTransaction({ renewalTxnId, orderIdHint = null }) {
  const txnId = String(renewalTxnId || '').trim();
  if (!txnId) return null;

  const already = await Order.findOne({ 'renewalPayments.renewalTxnId': txnId });
  if (already) return already;

  const byPending = await Order.findOne({ 'pendingRenewal.renewalTxnId': txnId });
  if (byPending) return byPending;

  if (orderIdHint) {
    const byId = await Order.findById(orderIdHint);
    if (byId) {
      const meta = await lookupRazorpayRenewalByReceipt(txnId);
      if (meta?.mongoOrderId && String(meta.mongoOrderId) === String(byId._id)) {
        return byId;
      }
      if (!meta && byId.pendingRenewal?.renewalTxnId === txnId) {
        return byId;
      }
    }
  }

  const meta = await lookupRazorpayRenewalByReceipt(txnId);
  if (meta?.mongoOrderId) {
    return Order.findById(meta.mongoOrderId);
  }

  return null;
}

/**
 * When customer paid an older RENEWAL_* session, restore pendingRenewal on the order
 * so confirm / wallet debit / amount checks use the correct txn.
 */
export async function alignPendingRenewalForConfirm(order, renewalTxnId) {
  if (!order?._id) return null;
  const txnId = String(renewalTxnId || '').trim();
  if (!txnId) return order;

  if (order.pendingRenewal?.renewalTxnId === txnId) {
    return order;
  }

  const meta = await lookupRazorpayRenewalByReceipt(txnId);
  if (!meta) return order;

  if (meta.mongoOrderId && String(meta.mongoOrderId) !== String(order._id)) {
    const err = new Error('Renewal payment belongs to a different service order');
    err.status = 400;
    throw err;
  }

  const renewalPrice = await resolveOrderRenewalPrice(order);
  const gatewayAmount =
    meta.amountPaise > 0 ? Math.round(meta.amountPaise) / 100 : renewalPrice;
  const walletAmount = Number(meta.notes?.wallet_amount) || 0;
  const prev = order.pendingRenewal?.toObject?.() || order.pendingRenewal || {};

  const aligned = {
    renewalTxnId: txnId,
    initiatedAt: prev.initiatedAt || new Date(),
    paymentMethod: prev.paymentMethod || 'razorpay',
    amount: Number(prev.amount) || renewalPrice,
    gatewayAmount: Number(prev.gatewayAmount) || gatewayAmount,
    walletAmount,
    walletDeducted: !!prev.walletDeducted,
    walletPending: walletAmount > 0 && !prev.walletDeducted && gatewayAmount > 0,
    walletTxnId: prev.walletTxnId || '',
    gatewayOrderId: meta.razorpayOrderId,
    realignedFromTxn: prev.renewalTxnId || null,
    realignedAt: new Date(),
  };

  await Order.findByIdAndUpdate(order._id, { pendingRenewal: aligned });
  return Order.findById(order._id);
}

/**
 * Before starting a new renewal checkout — reuse open session or block if prior payment captured.
 */
export async function evaluateExistingPendingRenewal(order, renewalPrice) {
  const pending = order.pendingRenewal?.toObject?.() || order.pendingRenewal;
  if (!pending?.renewalTxnId) {
    return { action: 'create_new' };
  }

  const age = Date.now() - new Date(pending.initiatedAt || 0).getTime();
  if (age > PENDING_REUSE_MAX_MS) {
    return { action: 'create_new' };
  }

  let gatewayOrderId = String(pending.gatewayOrderId || '').trim();
  if (!gatewayOrderId) {
    const meta = await lookupRazorpayRenewalByReceipt(pending.renewalTxnId);
    gatewayOrderId = meta?.razorpayOrderId || '';
  }

  const alreadyApplied = order.renewalPayments?.some(
    (rp) => rp.renewalTxnId === pending.renewalTxnId
  );

  if (gatewayOrderId) {
    const razorpay = getRazorpayClient();
    const paid = await razorpayOrderHasCapturedPayment(razorpay, gatewayOrderId);

    if (paid && !alreadyApplied) {
      return {
        action: 'block',
        renewalTxnId: pending.renewalTxnId,
        gatewayOrderId,
        message:
          'Your previous renewal payment is already received. Please wait a moment and refresh this page — do not start another payment.',
      };
    }

    if (!paid && !alreadyApplied) {
      try {
        const rzpOrder = razorpay ? await razorpay.orders.fetch(gatewayOrderId) : null;
        const open = rzpOrder && (rzpOrder.status === 'created' || rzpOrder.status === 'attempted');
        const expectedGateway = Number(pending.gatewayAmount) || renewalPrice;
        if (open && Math.abs(expectedGateway - renewalPrice) < 0.02) {
          return {
            action: 'reuse',
            renewalTxnId: pending.renewalTxnId,
            gatewayOrderId,
            pending,
          };
        }
      } catch {
        /* fall through — create new session */
      }
    }
  }

  return { action: 'create_new' };
}

export function buildRazorpayReusePayload(gatewayOrderId, amount) {
  return {
    method: 'razorpay',
    gatewayOrderId,
    chargedAmount: amount,
    payload: {
      razorpay: {
        order_id: gatewayOrderId,
        amount: Math.round(amount * 100),
        currency: 'INR',
      },
    },
  };
}
