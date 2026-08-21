import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import Order from '@/models/orderModel';
import Cart from '@/models/cartModel';
import userWalletService from '@/services/userWalletService';
import NotificationService from '@/services/notificationService';
import { fulfillOrderInventory } from '@/lib/fulfillOrderInventory';
import { verifyUPIPayment } from '@/lib/paymentGateways';
import { getRazorpayClient } from '@/lib/razorpayClient';
const { resolveOrderExpiryOnPayment } = require('@/lib/advpsOrderExpiry');
import {
  paymentAmountsMatch,
  expectedGatewayAmountFromSession,
} from '@/lib/paymentAmountValidation';
import { confirmResellerRechargeRequest } from '@/lib/resellerRechargeService';

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
 *   3. ResellerRechargeRequest (reseller auto UPI top-up)
 *   4. Order           (single Buy Now — caller handles, return null)
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

  const resellerRecharge = await ResellerRechargeRequest.findOne({ clientTxnId, method: 'auto_upi' });
  if (resellerRecharge) return { kind: 'reseller_recharge', doc: resellerRecharge };

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

  if (gateway === 'upi') {
    const result = await verifyUPIPayment(session.clientTxnId, session.gatewayOrderId);
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
        const paidInr = Number(captured?.amount ?? razorpayOrder.amount) / 100;
        const expected = expectedGatewayAmountFromSession(session);
        if (!paymentAmountsMatch(paidInr, expected)) {
          return { verified: false, gateway: 'razorpay', reason: 'amount mismatch' };
        }
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
          const paidInr = Number(captured.amount) / 100;
          const expected = expectedGatewayAmountFromSession(session);
          if (!paymentAmountsMatch(paidInr, expected)) {
            return { verified: false, gateway: 'razorpay', reason: 'amount mismatch' };
          }
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

  if (gateway === 'upi') {
    const result = await verifyUPIPayment(recharge.clientTxnId, recharge.gatewayOrderId);
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
        allowRecovery: ['failed', 'cancelled'].includes(fresh.status),
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

  const existing = await WalletRecharge.findById(recharge._id);
  if (!existing) return { success: false, reason: 'recharge missing' };
  if (existing.status === 'confirmed') {
    const newBalance = await userWalletService.getBalance(existing.user);
    return { success: true, alreadyProcessed: true, rechargeId: existing._id, newBalance };
  }

  // Crash between credit() and status=confirmed leaves walletTxnId empty but
  // the wallet txn (reference = rechargeId) already exists. Heal that first.
  if (existing.walletTxnId || await userWalletService.findTxnByReference(existing.user, existing._id)) {
    const prior = existing.walletTxnId
      ? null
      : await userWalletService.findTxnByReference(existing.user, existing._id);
    existing.status = 'confirmed';
    existing.creditedAt = existing.creditedAt || new Date();
    if (!existing.walletTxnId && prior?._id) {
      existing.walletTxnId = String(prior._id);
    }
    await existing.save();
    const newBalance = await userWalletService.getBalance(existing.user);
    return {
      success: true,
      alreadyProcessed: true,
      rechargeId: existing._id,
      newBalance,
      walletTxnId: existing.walletTxnId,
    };
  }

  const claimed = await WalletRecharge.findOneAndUpdate(
    { _id: recharge._id, status: 'pending' },
    { $set: { status: 'processing' } },
    { new: true }
  );
  if (!claimed) {
    const fresh = await WalletRecharge.findById(recharge._id);
    if (fresh?.status === 'confirmed') {
      const newBalance = await userWalletService.getBalance(fresh.user);
      return { success: true, alreadyProcessed: true, rechargeId: fresh._id, newBalance };
    }
    // Another worker is mid-credit, or a stuck processing row already credited.
    if (fresh?.walletTxnId || await userWalletService.findTxnByReference(fresh?.user, fresh?._id)) {
      const prior = fresh.walletTxnId
        ? null
        : await userWalletService.findTxnByReference(fresh.user, fresh._id);
      fresh.status = 'confirmed';
      fresh.creditedAt = fresh.creditedAt || new Date();
      if (!fresh.walletTxnId && prior?._id) fresh.walletTxnId = String(prior._id);
      await fresh.save();
      const newBalance = await userWalletService.getBalance(fresh.user);
      return {
        success: true,
        alreadyProcessed: true,
        rechargeId: fresh._id,
        newBalance,
        walletTxnId: fresh.walletTxnId,
      };
    }
    return { success: false, reason: 'recharge not pending' };
  }

  recharge = claimed;
  if (paymentMethod) recharge.paymentMethod = paymentMethod;
  if (transactionId) recharge.transactionId = transactionId;
  if (paymentDetails) recharge.paymentDetails = { ...(recharge.paymentDetails || {}), ...paymentDetails };

  const verifiedAmount =
    Number(paymentDetails?.payment_amount) ||
    Number(paymentDetails?.verifiedAmount) ||
    Number(recharge.amount);

  if (!paymentAmountsMatch(verifiedAmount, recharge.amount)) {
    recharge.status = 'pending';
    await recharge.save();
    return { success: false, reason: 'amount mismatch' };
  }

  const creditAmount = Math.min(Number(recharge.amount), Number(verifiedAmount));

  // Final race guard: if we were reset from processing→pending after a credit
  // already landed, do not credit again.
  const alreadyCredited = await userWalletService.findTxnByReference(recharge.user, recharge._id);
  let creditResult;
  if (alreadyCredited) {
    creditResult = {
      walletTxnId: String(alreadyCredited._id),
      balanceAfter: await userWalletService.getBalance(recharge.user),
    };
  } else {
    try {
      creditResult = await userWalletService.credit(recharge.user, creditAmount, {
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
      recharge.status = 'pending';
      await recharge.save();
      return { success: false, error: err.message };
    }
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

export async function confirmResellerRechargeFromWebhook(rechargeRequest, { paymentMethod, transactionId, paymentDetails } = {}) {
  return confirmResellerRechargeRequest(rechargeRequest, {
    paymentMethod: paymentMethod || 'upi',
    transactionId,
    paymentDetails,
  });
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
export async function confirmCheckoutFromWebhook(session, { paymentMethod, transactionId, paymentDetails, allowRecovery = false } = {}) {
  if (!session) return { success: false, reason: 'session missing' };

  let fresh = await CheckoutSession.findById(session._id);
  if (!fresh) return { success: false, reason: 'session missing' };
  session = fresh;

  if (session.status === 'confirmed') {
    return { success: true, alreadyProcessed: true, sessionId: session._id };
  }

  if (session.status === 'failed' || session.status === 'cancelled') {
    if (!allowRecovery) {
      return { success: false, reason: `session is ${session.status}` };
    }
    await CheckoutSession.updateOne(
      { _id: session._id, status: { $in: ['failed', 'cancelled'] } },
      { $set: { status: 'pending', failureReason: null, failedAt: null } }
    );
    session = await CheckoutSession.findById(session._id);
    if (!session || session.status !== 'pending') {
      return { success: false, reason: 'session recovery failed' };
    }
  }

  const claimed = await CheckoutSession.findOneAndUpdate(
    { _id: session._id, status: 'pending' },
    { $set: { status: 'processing' } },
    { new: true }
  );
  if (!claimed) {
    const again = await CheckoutSession.findById(session._id);
    if (again?.status === 'confirmed') {
      return { success: true, alreadyProcessed: true, sessionId: again._id };
    }
    return { success: false, reason: 'session not available for confirmation' };
  }
  session = claimed;

  // Deduct-on-success: charge the FULL wallet portion now that gateway paid.
  // Do not confirm the session if the wallet cannot cover its share — prevents
  // VPS delivery without the wallet portion being collected.
  if (session.walletAmount > 0 && !session.walletTxnId) {
    try {
      const debit = await userWalletService.debit(session.user, session.walletAmount, {
        description: `Cart checkout wallet payment #${session._id}`,
        reference: String(session._id),
        metadata: {
          sessionId: String(session._id),
          clientTxnId: session.clientTxnId,
          reason: 'deduct_on_success',
        },
      });
      session.walletTxnId = debit.walletTxnId;
    } catch (err) {
      console.error('[confirmCheckoutFromWebhook] wallet debit-on-success failed:', err.message);
      session.status = 'pending';
      await session.save();
      return {
        success: false,
        reason: 'wallet_portion_unpaid',
        error: err.message,
      };
    }
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
      updated?.slotIpId ||
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

  const fresh = await CheckoutSession.findById(session._id);
  if (!fresh) return { success: false, reason: 'session missing' };
  session = fresh;

  if (session.status === 'confirmed') {
    return { success: false, reason: 'already confirmed' };
  }

  if (session.status !== 'confirmed') {
    const probe = await probeCheckoutSessionPayment(session);
    if (probe.verified) {
      return confirmCheckoutFromWebhook(session, {
        paymentMethod: probe.gateway,
        transactionId: probe.transactionId,
        paymentDetails: probe.paymentDetails,
        allowRecovery: true,
      });
    }
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
