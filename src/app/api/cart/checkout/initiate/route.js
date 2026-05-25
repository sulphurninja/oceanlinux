import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import Cart from '@/models/cartModel';
import Order from '@/models/orderModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import userWalletService from '@/services/userWalletService';
import { priceCart } from '@/lib/cartPricing';
import { createGatewayOrder, buildClientTxnId } from '@/lib/paymentGateways';
import { confirmCheckoutFromWebhook } from '@/lib/paymentDispatch';

const AutoProvisioningService = require('@/services/autoProvisioningService');

/**
 * POST /api/cart/checkout/initiate
 * Body: { paymentMethod: 'razorpay'|'cashfree'|'upi', useWallet: boolean }
 *
 * Atomic-ish flow:
 *   1. Re-price cart server-side (live prices + promos + availability).
 *   2. Compute walletAmount + gatewayAmount based on `useWallet`.
 *   3. If walletAmount > 0: debit wallet immediately (race-protected by
 *      `userWalletService.debit`'s balance-guard). Refunded on failure.
 *   4. Create CheckoutSession + N child Order docs in 'pending' state.
 *      Each child carries `checkoutSessionId` + `parentTxnId` so webhook
 *      dispatch finds the session first.
 *   5. If gatewayAmount > 0: create gateway order against
 *      `session.clientTxnId` and return SDK payload.
 *      If gatewayAmount === 0 (wallet-only): immediately mark session
 *      confirmed and kick off bulkProvision.
 *
 * On any failure after the wallet debit lands: best-effort refund of
 * the reservation and orders are marked failed. The /sweep cron is the
 * safety net for whatever slips past.
 */
export async function POST(request) {
  await connectDB();

  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return NextResponse.json({ success: false, message: err?.message || 'Unauthorized' }, { status: 401 });
  }

  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const useWallet = !!body?.useWallet;
  const requestedGateway = ['razorpay', 'cashfree', 'upi'].includes(body?.paymentMethod)
    ? body.paymentMethod
    : 'razorpay';

  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ success: false, message: 'Cart is empty' }, { status: 400 });
  }

  // Re-price server-side. If anything is unavailable, refuse to start
  // checkout — the UI surfaces these in the cart page.
  const priced = await priceCart(cart.items);
  const invalidLines = priced.lines.filter(l => !l.priced.valid);
  if (invalidLines.length > 0) {
    return NextResponse.json({
      success: false,
      message: 'Some items are no longer available',
      invalidItems: invalidLines.map(l => ({
        cartItemId: l.item._id,
        reason: l.priced.reason,
      })),
    }, { status: 400 });
  }
  if (priced.total <= 0) {
    return NextResponse.json({ success: false, message: 'Cart total must be greater than zero' }, { status: 400 });
  }

  // Wallet math.
  let walletApplied = 0;
  if (useWallet) {
    const balance = await userWalletService.getBalance(userId);
    walletApplied = Math.min(balance, priced.total);
  }
  const gatewayCharge = priced.total - walletApplied;

  const clientTxnId = buildClientTxnId('CART');

  // Build itemsSnapshot + create N orders + the session.
  const itemsSnapshot = priced.lines.map(({ item, priced: lp }) => ({
    kind: item.kind,
    ipStockId: item.kind === 'ipstock' ? item.ipStockId : undefined,
    slotIpPackageId: item.kind === 'slotip' ? item.slotIpPackageId : undefined,
    productName: lp.productName,
    memory: item.memory,
    os: item.os || 'Ubuntu 22',
    quantity: item.quantity,
    unitOriginalPrice: lp.unitOriginalPrice,
    unitPrice: lp.unitPrice,
    unitDiscount: lp.unitDiscount,
    promoCode: item.promoCode || '',
  }));

  const paymentMethodLabel = walletApplied === priced.total
    ? 'wallet'
    : (walletApplied > 0 ? `wallet+${requestedGateway}` : requestedGateway);

  const session = await CheckoutSession.create({
    user: userId,
    clientTxnId,
    paymentMethod: paymentMethodLabel,
    subtotal: priced.subtotal,
    promoDiscount: priced.discount,
    walletAmount: walletApplied,
    gatewayAmount: gatewayCharge,
    total: priced.total,
    status: 'pending',
    itemsSnapshot,
    customerName: user.name,
    customerEmail: user.email,
    customerPhone: user.phone || '',
  });

  // Reserve wallet amount up-front. If this fails, abort the session.
  let walletDebit = null;
  if (walletApplied > 0) {
    try {
      walletDebit = await userWalletService.debit(userId, walletApplied, {
        description: `Cart checkout #${session._id}`,
        reference: String(session._id),
        metadata: {
          checkoutSessionId: session._id,
          clientTxnId,
          totalAmount: priced.total,
          gatewayAmount: gatewayCharge,
        },
      });
      session.walletTxnId = walletDebit.walletTxnId;
      await session.save();
    } catch (err) {
      session.status = 'failed';
      session.failureReason = `Wallet reservation failed: ${err.message}`;
      session.failedAt = new Date();
      await session.save();
      return NextResponse.json(
        { success: false, message: err.message || 'Wallet reservation failed' },
        { status: 400 }
      );
    }
  }

  // Fan out to N Order docs (qty > 1 spawns multiple orders).
  const orderIds = [];
  let orderIdx = 0;
  try {
    for (const snap of itemsSnapshot) {
      for (let i = 0; i < snap.quantity; i++) {
        const orderTxnId = `${clientTxnId}-${orderIdx}`;
        const orderData = {
          user: userId,
          productName: snap.productName,
          memory: snap.kind === 'slotip' ? 'Slot IP' : snap.memory,
          price: snap.unitPrice,
          originalPrice: snap.unitOriginalPrice,
          promoCode: snap.unitDiscount > 0 ? snap.promoCode : null,
          promoDiscount: snap.unitDiscount,
          clientTxnId: orderTxnId,
          gatewayOrderId: '',
          paymentMethod: paymentMethodLabel,
          status: 'pending',
          customerName: user.name,
          customerEmail: user.email,
          checkoutSessionId: String(session._id),
          parentTxnId: clientTxnId,
          os: snap.os || 'Ubuntu 22',
        };
        if (snap.kind === 'slotip') {
          orderData.slotIpPackageId = snap.slotIpPackageId;
          orderData.provider = 'slotip';
        } else {
          orderData.ipStockId = snap.ipStockId;
        }
        const order = await Order.create(orderData);
        orderIds.push(order._id);
        orderIdx++;
      }
    }
    session.orderIds = orderIds;
    await session.save();
  } catch (err) {
    // Roll back: refund wallet, mark session failed, delete orders we created.
    console.error('[cart checkout initiate] order fan-out failed:', err);
    if (walletDebit) {
      try {
        await userWalletService.refund(userId, walletApplied, {
          description: `Cart checkout refund #${session._id}`,
          reference: String(session._id),
        });
      } catch (refundErr) {
        console.error('[cart checkout initiate] refund failed:', refundErr);
      }
    }
    if (orderIds.length) {
      await Order.deleteMany({ _id: { $in: orderIds } }).catch(() => {});
    }
    session.status = 'failed';
    session.failureReason = `Order fan-out failed: ${err.message}`;
    session.failedAt = new Date();
    await session.save();
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to create orders' },
      { status: 500 }
    );
  }

  // Wallet-only checkout: confirm immediately, fire bulkProvision.
  if (gatewayCharge === 0) {
    const result = await confirmCheckoutFromWebhook(session, {
      paymentMethod: 'wallet',
      transactionId: walletDebit?.walletTxnId,
      paymentDetails: {
        walletOnly: true,
        confirmedAt: new Date(),
      },
    });
    return NextResponse.json({
      success: true,
      walletOnly: true,
      sessionId: session._id,
      clientTxnId,
      orderIds,
      message: result.success ? 'Cart paid using wallet' : (result.reason || 'Confirm failed'),
    });
  }

  // Mixed (wallet+gateway) or gateway-only checkout. Create gateway order.
  let gatewayResult;
  try {
    gatewayResult = await createGatewayOrder({
      preferredMethod: requestedGateway,
      clientTxnId,
      amount: gatewayCharge,
      customer: {
        id: userId,
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999',
      },
      callbackPath: '/payment/callback?type=cart',
      notifyPath: '/api/payment/webhook',
      notes: {
        purpose: 'cart_checkout',
        session_id: String(session._id),
        item_count: String(orderIds.length),
      },
      description: `Cart checkout (${orderIds.length} item${orderIds.length === 1 ? '' : 's'})`,
    });
  } catch (err) {
    // Refund wallet, mark session failed.
    if (walletDebit) {
      try {
        await userWalletService.refund(userId, walletApplied, {
          description: `Cart checkout refund #${session._id}`,
          reference: String(session._id),
        });
      } catch {}
    }
    await Order.updateMany({ _id: { $in: orderIds }, status: 'pending' }, { $set: { status: 'failed' } });
    session.status = 'failed';
    session.failureReason = `Gateway order creation failed: ${err.message}`;
    session.failedAt = new Date();
    await session.save();
    return NextResponse.json(
      { success: false, message: 'Failed to create gateway order', error: err.message },
      { status: 500 }
    );
  }

  session.gatewayOrderId = gatewayResult.gatewayOrderId;
  if (gatewayResult.method !== requestedGateway) {
    // Update payment method label to reflect actual gateway used.
    session.paymentMethod = walletApplied > 0
      ? `wallet+${gatewayResult.method}`
      : gatewayResult.method;
  }
  await session.save();

  return NextResponse.json({
    success: true,
    sessionId: session._id,
    clientTxnId,
    orderIds,
    walletApplied,
    gatewayAmount: gatewayCharge,
    actualPaymentMethod: gatewayResult.method,
    fallbackUsed: gatewayResult.fallbackUsed,
    originalMethod: gatewayResult.originalMethod,
    customer: {
      name: user.name,
      email: user.email,
      phone: user.phone || '9999999999',
    },
    ...gatewayResult.payload,
  });
}
