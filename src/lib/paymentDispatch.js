import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import Order from '@/models/orderModel';
import Cart from '@/models/cartModel';
import userWalletService from '@/services/userWalletService';
import NotificationService from '@/services/notificationService';
import { fulfillOrderInventory } from '@/lib/fulfillOrderInventory';
import { verifyCashfreePayment, verifyUPIPayment } from '@/lib/paymentGateways';
import { getRazorpayClient } from '@/lib/razorpayClient';
const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');

const AutoProvisioningService = require('@/services/autoProvisioningService');

/**
 * Single dispatch shim used by:
 *   - /api/payment/webhook       (Cashfree)
 *   - /api/payment/upi-webhook   (UPI Gateway)
 *   - /api/payment/status        (poll fallback, future)
 *
 * Looks up the clientTxnId across our parent collections in this order:
 *   1. CheckoutSession (cart checkout)
 *   2. WalletRecharge  (top-up)
 *   3. Order           (single Buy Now — caller handles, return null)
 *
 * Returns null if none match, in which case the caller falls back to the
 * existing single-order path that lives in each webhook handler.
 */
export async function findDispatchTarget(clientTxnId) {
  if (!clientTxnId) return null;

  const session = await CheckoutSession.findOne({ clientTxnId });
  if (session) return { kind: 'checkout', doc: session };

  const recharge = await WalletRecharge.findOne({ clientTxnId });
  if (recharge) return { kind: 'recharge', doc: recharge };

  return null;
}

/**
 * Probe gateway for a pending cart checkout session (no client signature).
 * Used by /api/payment/status and recovery paths when confirm raced webhook.
 */
export async function probeCheckoutSessionPayment(session) {
  if (!session) return { verified: false, reason: 'session missing' };

  const gateway = String(session.paymentMethod || '').replace(/^wallet\+/, '');

  if (gateway === 'wallet') {
    return {
      verified: true,
      gateway: 'wallet',
      transactionId: session.walletTxnId || '',
      paymentDetails: { walletOnly: true, confirmedAt: new Date() },
    };
  }

  if (gateway === 'cashfree') {
    const result = await verifyCashfreePayment(session.clientTxnId);
    if (!result.verified) {
      return { verified: false, gateway: 'cashfree', reason: result.error || 'not paid' };
    }
    return {
      verified: true,
      gateway: 'cashfree',
      transactionId: result.payment.cf_payment_id,
      paymentDetails: {
        cf_payment_id: result.payment.cf_payment_id,
        cf_order_id: session.clientTxnId,
        payment_amount: result.payment.payment_amount,
        payment_method: result.payment.payment_method,
        confirmedAt: new Date(),
      },
    };
  }

  if (gateway === 'upi') {
    const result = await verifyUPIPayment(session.clientTxnId);
    if (!result.verified) {
      return { verified: false, gateway: 'upi', reason: result.error || 'not paid' };
    }
    if (result.amount && session.gatewayAmount && Math.abs(result.amount - session.gatewayAmount) > 1) {
      return { verified: false, gateway: 'upi', reason: 'amount mismatch' };
    }
    return {
      verified: true,
      gateway: 'upi',
      transactionId: result.upi_txn_id || '',
      paymentDetails: {
        upi_txn_id: result.upi_txn_id,
        verifiedAmount: result.amount,
        confirmedAt: new Date(),
      },
    };
  }

  if (gateway === 'razorpay') {
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return { verified: false, gateway: 'razorpay', reason: 'Razorpay not configured' };
    }

    const razorpayOrderId = session.gatewayOrderId;
    if (!razorpayOrderId) {
      return { verified: false, gateway: 'razorpay', reason: 'missing gateway order id' };
    }

    try {
      const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
      if (razorpayOrder.status === 'paid') {
        const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
        const captured = payments.items?.find((p) => p.status === 'captured');
        return {
          verified: true,
          gateway: 'razorpay',
          transactionId: captured?.id || razorpayOrderId,
          paymentDetails: {
            razorpay_payment_id: captured?.id,
            razorpay_order_id: razorpayOrderId,
            confirmedAt: new Date(),
          },
        };
      }

      if (razorpayOrder.status === 'attempted') {
        const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
        const captured = payments.items?.find((p) => p.status === 'captured');
        if (captured) {
          return {
            verified: true,
            gateway: 'razorpay',
            transactionId: captured.id,
            paymentDetails: {
              razorpay_payment_id: captured.id,
              razorpay_order_id: razorpayOrderId,
              confirmedAt: new Date(),
            },
          };
        }
      }

      return {
        verified: false,
        gateway: 'razorpay',
        reason: razorpayOrder.status === 'created' ? 'pending' : razorpayOrder.status,
      };
    } catch (err) {
      return { verified: false, gateway: 'razorpay', reason: err.message };
    }
  }

  return { verified: false, reason: `unsupported gateway ${gateway}` };
}

/**
 * Probe gateway for a pending wallet recharge (no client signature).
 */
export async function probeWalletRechargePayment(recharge) {
  if (!recharge) return { verified: false, reason: 'recharge missing' };

  const gateway = recharge.paymentMethod;

  if (gateway === 'cashfree') {
    const result = await verifyCashfreePayment(recharge.clientTxnId);
    if (!result.verified) {
      return { verified: false, gateway: 'cashfree', reason: result.error || 'not paid' };
    }
    return {
      verified: true,
      gateway: 'cashfree',
      transactionId: result.payment.cf_payment_id,
      paymentDetails: {
        cf_payment_id: result.payment.cf_payment_id,
        cf_order_id: recharge.clientTxnId,
        payment_amount: result.payment.payment_amount,
        payment_method: result.payment.payment_method,
        confirmedAt: new Date(),
      },
    };
  }

  if (gateway === 'upi') {
    const result = await verifyUPIPayment(recharge.clientTxnId);
    if (!result.verified) {
      return { verified: false, gateway: 'upi', reason: result.error || 'not paid' };
    }
    if (result.amount && Math.abs(result.amount - recharge.amount) > 1) {
      return { verified: false, gateway: 'upi', reason: 'amount mismatch' };
    }
    return {
      verified: true,
      gateway: 'upi',
      transactionId: result.upi_txn_id || '',
      paymentDetails: {
        upi_txn_id: result.upi_txn_id,
        verifiedAmount: result.amount,
        confirmedAt: new Date(),
      },
    };
  }

  if (gateway === 'razorpay') {
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return { verified: false, gateway: 'razorpay', reason: 'Razorpay not configured' };
    }

    const razorpayOrderId = recharge.gatewayOrderId;
    if (!razorpayOrderId) {
      return { verified: false, gateway: 'razorpay', reason: 'missing gateway order id' };
    }

    try {
      const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
      if (razorpayOrder.status === 'paid') {
        const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
        const captured = payments.items?.find((p) => p.status === 'captured');
        return {
          verified: true,
          gateway: 'razorpay',
          transactionId: captured?.id || razorpayOrderId,
          paymentDetails: {
            razorpay_payment_id: captured?.id,
            razorpay_order_id: razorpayOrderId,
            confirmedAt: new Date(),
          },
        };
      }

      if (razorpayOrder.status === 'attempted') {
        const payments = await razorpay.orders.fetchPayments(razorpayOrderId);
        const captured = payments.items?.find((p) => p.status === 'captured');
        if (captured) {
          return {
            verified: true,
            gateway: 'razorpay',
            transactionId: captured.id,
            paymentDetails: {
              razorpay_payment_id: captured.id,
              razorpay_order_id: razorpayOrderId,
              confirmedAt: new Date(),
            },
          };
        }
      }

      return {
        verified: false,
        gateway: 'razorpay',
        reason: razorpayOrder.status === 'created' ? 'pending' : razorpayOrder.status,
      };
    } catch (err) {
      return { verified: false, gateway: 'razorpay', reason: err.message };
    }
  }

  return { verified: false, reason: `unsupported gateway ${gateway}` };
}

/**
 * Confirm a pending wallet recharge when gateway reports paid (status poll / recovery).
 */
export async function recoverPendingWalletRecharge(recharge, { maxAttempts = 1, delayMs = 0 } = {}) {
  if (!recharge) return { success: false, reason: 'recharge missing' };

  if (recharge.status === 'confirmed') {
    const balance = await userWalletService.getBalance(recharge.user);
    return {
      success: true,
      alreadyProcessed: true,
      rechargeId: recharge._id,
      newBalance: balance,
    };
  }

  let lastProbe = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const fresh = await WalletRecharge.findById(recharge._id);
    if (!fresh) return { success: false, reason: 'recharge not found' };
    if (fresh.status === 'confirmed') {
      const balance = await userWalletService.getBalance(fresh.user);
      return {
        success: true,
        alreadyProcessed: true,
        rechargeId: fresh._id,
        newBalance: balance,
      };
    }

    lastProbe = await probeWalletRechargePayment(fresh);
    if (lastProbe.verified) {
      return confirmRechargeFromWebhook(fresh, {
        paymentMethod: lastProbe.gateway,
        transactionId: lastProbe.transactionId,
        paymentDetails: lastProbe.paymentDetails,
      });
    }
  }

  return { success: false, reason: lastProbe?.reason || 'payment not verified' };
}

/**
 * Confirm a pending cart checkout when gateway reports paid (status poll / recovery).
 */
export async function recoverPendingCheckoutSession(session, { maxAttempts = 1, delayMs = 0 } = {}) {
  if (!session) return { success: false, reason: 'session missing' };

  if (session.status === 'confirmed') {
    return { success: true, alreadyProcessed: true, sessionId: session._id, orderIds: session.orderIds };
  }

  let lastProbe = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const fresh = await CheckoutSession.findById(session._id);
    if (!fresh) return { success: false, reason: 'session not found' };
    if (fresh.status === 'confirmed') {
      return { success: true, alreadyProcessed: true, sessionId: fresh._id, orderIds: fresh.orderIds };
    }

    lastProbe = await probeCheckoutSessionPayment(fresh);
    if (lastProbe.verified) {
      return confirmCheckoutFromWebhook(fresh, {
        paymentMethod: lastProbe.gateway,
        transactionId: lastProbe.transactionId,
        paymentDetails: lastProbe.paymentDetails,
      });
    }
  }

  return { success: false, reason: lastProbe?.reason || 'payment not verified' };
}

/**
 * Confirm a wallet recharge from a verified webhook/poll. Idempotent —
 * if already confirmed, returns success without double-crediting.
 *
 * @param {object} recharge — WalletRecharge document
 * @param {object} args
 * @param {string} args.paymentMethod  — 'razorpay' | 'cashfree' | 'upi'
 * @param {string} [args.transactionId]
 * @param {object} [args.paymentDetails]
 */
export async function confirmRechargeFromWebhook(recharge, { paymentMethod, transactionId, paymentDetails } = {}) {
  if (!recharge) return { success: false, reason: 'recharge missing' };

  if (recharge.status === 'confirmed') {
    const newBalance = await userWalletService.getBalance(recharge.user);
    return { success: true, alreadyProcessed: true, rechargeId: recharge._id, newBalance };
  }

  if (paymentMethod) recharge.paymentMethod = paymentMethod;
  if (transactionId) recharge.transactionId = transactionId;
  if (paymentDetails) recharge.paymentDetails = { ...(recharge.paymentDetails || {}), ...paymentDetails };

  let creditResult;
  try {
    creditResult = await userWalletService.credit(recharge.user, recharge.amount, {
      type: 'credit',
      description: `Wallet top-up #${recharge._id}`,
      reference: String(recharge._id),
      metadata: {
        rechargeId: recharge._id,
        clientTxnId: recharge.clientTxnId,
        paymentMethod: recharge.paymentMethod,
        transactionId: recharge.transactionId,
      },
    });
  } catch (err) {
    console.error('[paymentDispatch] credit wallet failed:', err);
    return { success: false, error: err.message };
  }

  recharge.status = 'confirmed';
  recharge.creditedAt = new Date();
  recharge.walletTxnId = creditResult.walletTxnId;
  await recharge.save();

  return {
    success: true,
    rechargeId: recharge._id,
    newBalance: creditResult.balanceAfter,
    walletTxnId: creditResult.walletTxnId,
  };
}

/**
 * Confirm a cart checkout session from a verified webhook/poll/SDK
 * confirm. Marks the session + every child order `confirmed`, allocates
 * slot-IPs inline (mirroring `/api/payment/confirm`), kicks off
 * `bulkProvision` for non-slot orders in the background, clears the
 * user's cart.
 *
 * Idempotent: if already confirmed, returns success without re-running
 * provisioning.
 *
 * @param {object} session — CheckoutSession document
 * @param {object} args
 * @param {string} args.paymentMethod
 * @param {string} [args.transactionId]
 * @param {object} [args.paymentDetails]
 */
export async function confirmCheckoutFromWebhook(session, { paymentMethod, transactionId, paymentDetails } = {}) {
  if (!session) return { success: false, reason: 'session missing' };

  if (session.status === 'confirmed') {
    return { success: true, alreadyProcessed: true, sessionId: session._id };
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    return { success: false, reason: `session is ${session.status}` };
  }

  // Mark session confirmed first (atomic-ish — orders update next).
  session.status = 'confirmed';
  session.confirmedAt = new Date();
  if (paymentMethod) session.paymentMethod = paymentMethod === 'wallet' ? 'wallet' : (
    session.walletAmount > 0 ? `wallet+${paymentMethod}` : paymentMethod
  );
  if (paymentDetails) session.paymentDetails = { ...(session.paymentDetails || {}), ...paymentDetails };
  await session.save();

  // Update all child orders to 'confirmed'. We do them one-by-one (not
  // updateMany) so model hooks / panel-credentials helpers can run
  // per-order if added later.
  const orders = await Order.find({ _id: { $in: session.orderIds } });

  for (const order of orders) {
    if (order.status === 'confirmed') continue;

    order.status = 'confirmed';
    const orderExpiry = await resolveOrderExpiryOnPayment(order);
    if (orderExpiry) order.expiryDate = orderExpiry;
    if (transactionId) order.transactionId = transactionId;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    order.paymentDetails = {
      ...(order.paymentDetails || {}),
      ...(paymentDetails || {}),
      checkoutSessionId: session._id.toString(),
      parentTxnId: session.clientTxnId,
      confirmedViaCheckout: true,
      confirmedAt: new Date(),
    };
    await order.save();
  }

  const provisionableOrderIds = [];

  for (const order of orders) {
    const fresh = await Order.findById(order._id);
    if (!fresh) continue;
    await fulfillOrderInventory(fresh);
    const updated = await Order.findById(order._id);
    if (
      updated?.slotIpPackageId ||
      updated?.inventoryItemId ||
      updated?.ipAddress ||
      updated?.provisioningStatus === 'active'
    ) {
      continue;
    }
    provisionableOrderIds.push(order._id);
  }

  const slotOrderIds = orders.filter((o) => o.slotIpPackageId).map((o) => o._id);

  // Kick off bulk provisioning for non-slot orders (fire-and-forget).
  if (provisionableOrderIds.length) {
    try {
      const provisioningService = new AutoProvisioningService();
      provisioningService
        .bulkProvision(provisionableOrderIds.map(id => id.toString()))
        .then(results => {
          console.log(`[paymentDispatch] bulkProvision finished for session ${session._id}, results: ${results.length}`);
        })
        .catch(err => {
          console.error(`[paymentDispatch] bulkProvision error for session ${session._id}:`, err);
        });
    } catch (err) {
      console.error('[paymentDispatch] failed to start bulkProvision:', err);
    }
  }

  // Clear the user's cart now that all items are checked out.
  try {
    await Cart.updateOne({ user: session.user }, { $set: { items: [] } });
  } catch (cartErr) {
    console.error('[paymentDispatch] cart clear failed (non-fatal):', cartErr);
  }

  // Best-effort notification per order.
  for (const orderId of [...slotOrderIds, ...provisionableOrderIds]) {
    try {
      const order = await Order.findById(orderId);
      if (order) await NotificationService.notifyOrderConfirmed(order.user, order);
    } catch (notifErr) {
      // Non-fatal.
    }
  }

  return {
    success: true,
    sessionId: session._id,
    orderIds: session.orderIds,
    provisionedCount: provisionableOrderIds.length,
    slotAllocatedCount: slotOrderIds.length,
  };
}

/**
 * Refund a CheckoutSession's wallet reservation (if any) and mark every
 * child order failed. Used by the explicit cancel route AND the sweep
 * cron for stale pending sessions. Idempotent.
 */
export async function refundAndFailCheckoutSession(session, reason = 'cancelled') {
  if (!session) return { success: false };

  if (session.status === 'confirmed') {
    return { success: false, reason: 'already confirmed' };
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    return { success: true, alreadyProcessed: true };
  }

  // Refund wallet reservation if there was one and it hasn't been refunded.
  if (session.walletAmount > 0 && session.walletTxnId) {
    try {
      await userWalletService.refund(session.user, session.walletAmount, {
        description: `Cart checkout refund #${session._id}`,
        reference: String(session._id),
        metadata: {
          sessionId: session._id,
          clientTxnId: session.clientTxnId,
          reason,
          originalDebitTxnId: session.walletTxnId,
        },
      });
    } catch (err) {
      console.error('[paymentDispatch] refund failed:', err);
      // Continue — still mark session failed but record the refund issue.
      session.failureReason = `${reason} (refund failed: ${err.message})`;
    }
  }

  session.status = reason === 'cancelled' ? 'cancelled' : 'failed';
  session.failedAt = new Date();
  if (!session.failureReason) session.failureReason = reason;
  await session.save();

  // Mark child orders failed (only those still pending).
  await Order.updateMany(
    { _id: { $in: session.orderIds }, status: 'pending' },
    { $set: { status: 'failed' } }
  );

  return { success: true, sessionId: session._id };
}
