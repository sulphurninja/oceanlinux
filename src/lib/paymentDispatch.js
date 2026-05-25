import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import Order from '@/models/orderModel';
import Cart from '@/models/cartModel';
import userWalletService from '@/services/userWalletService';
import { calculateExpiryDate } from '@/lib/expiryHelper';
import NotificationService from '@/services/notificationService';

const AutoProvisioningService = require('@/services/autoProvisioningService');
const SlotIPPackage = require('@/models/slotIpPackageModel');

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
    return { success: true, alreadyProcessed: true, rechargeId: recharge._id };
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

  const expiryDate = calculateExpiryDate();

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
  const slotOrderIds = [];
  const provisionableOrderIds = [];

  for (const order of orders) {
    if (order.status === 'confirmed') {
      // already handled; just include for slot allocation if needed below
      if (order.slotIpPackageId && !order.slotIpId) slotOrderIds.push(order._id);
      else if (!order.slotIpPackageId) provisionableOrderIds.push(order._id);
      continue;
    }

    order.status = 'confirmed';
    order.expiryDate = expiryDate;
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

    if (order.slotIpPackageId && !order.slotIpId) {
      slotOrderIds.push(order._id);
    } else if (!order.slotIpPackageId) {
      provisionableOrderIds.push(order._id);
    }
  }

  // Allocate slot IPs INLINE — same pattern as /api/payment/confirm.
  for (const orderId of slotOrderIds) {
    try {
      const order = await Order.findById(orderId);
      if (!order || !order.slotIpPackageId || order.slotIpId) continue;

      const allocated = await SlotIPPackage.findOneAndUpdate(
        { _id: order.slotIpPackageId, 'ips.allocated': false },
        {
          $set: {
            'ips.$.allocated': true,
            'ips.$.orderId': order._id,
            'ips.$.allocatedAt': new Date(),
          },
        },
        { new: true }
      );

      if (allocated) {
        const slotIp = allocated.ips.find(
          ip => ip.orderId && ip.orderId.toString() === order._id.toString()
        );
        if (slotIp) {
          order.slotIpId = slotIp._id.toString();
          order.ipAddress = `${slotIp.ip}:${slotIp.port}`;
          order.username = slotIp.username;
          order.password = slotIp.password;
          order.provisioningStatus = 'active';
          order.autoProvisioned = true;
          order.provider = 'slotip';
          await order.save();
        }
      } else {
        order.provisioningStatus = 'failed';
        order.provisioningError = 'No available slot IPs in this package';
        await order.save();
      }
    } catch (slotErr) {
      console.error('[paymentDispatch] slot IP allocation error:', slotErr);
    }
  }

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
