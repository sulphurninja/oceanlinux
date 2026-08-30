import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Order from '@/models/orderModel';
import WalletRecharge from '@/models/walletRechargeModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import User from '@/models/userModel';
import { getVyaparCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { createVyaparOrderWithUniqueAmount } from '@/lib/vyaparGateway';
import { UPI_PROVIDER_VYAPAR } from '@/lib/paymentGateways';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Re-issue a UPI payment order whose QR has expired.
 *
 * VyaparGateway holds an order open for about two minutes, which is often less
 * than a customer needs to open their UPI app and authorise. Rather than making
 * them start checkout over, the pending record keeps its identity and only the
 * gateway order behind it is replaced.
 */
export async function POST(request) {
  await connectDB();

  const userId = await getDataFromToken(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const limited = enforcePaymentRateLimit(request, { max: 30 });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const txnId = String(body.clientTxnId || body.renewalTxnId || '').trim();
  if (!txnId) {
    return NextResponse.json({ success: false, message: 'Transaction id required' }, { status: 400 });
  }

  const settings = await getResellerRechargeSettings();
  const vyapar = getVyaparCredentials(settings);
  if (!vyapar) {
    return NextResponse.json(
      { success: false, message: 'UPI refresh is unavailable. Please retry checkout.' },
      { status: 400 }
    );
  }

  const target = await findRefreshTarget(txnId, userId);
  if (!target) {
    return NextResponse.json({ success: false, message: 'Payment not found' }, { status: 404 });
  }
  if (target.settled) {
    return NextResponse.json({ success: true, alreadyPaid: true });
  }
  // Re-issuing replaces the stored gateway order id, which would strand a
  // Razorpay checkout that is still in flight.
  if (!String(target.paymentMethod || '').includes('upi')) {
    return NextResponse.json(
      { success: false, message: 'This payment is not a UPI payment' },
      { status: 400 }
    );
  }
  if (target.baseAmount <= 0) {
    return NextResponse.json({ success: false, message: 'Nothing left to pay' }, { status: 400 });
  }

  const user = await User.findById(userId).select('name email phone').lean();

  let created;
  try {
    created = await createVyaparOrderWithUniqueAmount({
      apiKey: vyapar.apiKey,
      amount: target.baseAmount,
      clientTxnId: txnId,
      customerName: user?.name,
      customerEmail: user?.email,
      customerMobile: user?.phone,
      description: target.description,
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 502 });
  }

  await target.persist(created);

  return NextResponse.json({
    success: true,
    clientTxnId: txnId,
    upi: {
      order_id: created.orderId,
      payment_id: created.orderId,
      payment_url: created.paymentUrl,
      qrImageUrl: created.qrImageUrl,
      amount: created.chargedAmount,
      expiresAt: created.expiresAt,
      provider: UPI_PROVIDER_VYAPAR,
      currency: 'INR',
    },
  });
}

const OPEN_ORDER_STATUSES = ['pending', 'processing'];

async function findRefreshTarget(txnId, userId) {
  if (txnId.startsWith('RENEWAL_')) {
    const order = await Order.findOne({ 'pendingRenewal.renewalTxnId': txnId });
    if (!order || String(order.user) !== String(userId)) return null;
    const pending = order.pendingRenewal || {};
    return {
      settled: !pending.renewalTxnId,
      paymentMethod: pending.paymentMethod,
      baseAmount: Math.max(0, Number(pending.amount || 0) - (Number(pending.walletAmount) || 0)),
      description: `Renewal ${order.productName || ''}`.trim(),
      persist: async (created) => {
        order.pendingRenewal.gatewayOrderId = created.orderId;
        order.pendingRenewal.gatewayAmount = created.chargedAmount;
        order.markModified('pendingRenewal');
        await order.save();
      },
    };
  }

  if (txnId.startsWith('WALLET_')) {
    const recharge = await WalletRecharge.findOne({ clientTxnId: txnId });
    if (!recharge || String(recharge.user) !== String(userId)) return null;
    return {
      settled: !OPEN_ORDER_STATUSES.includes(recharge.status),
      paymentMethod: recharge.paymentMethod,
      baseAmount: Number(recharge.amount) || 0,
      description: 'Wallet recharge',
      persist: async (created) => {
        recharge.gatewayOrderId = created.orderId;
        recharge.amount = created.chargedAmount;
        await recharge.save();
      },
    };
  }

  if (txnId.startsWith('CART_')) {
    const session = await CheckoutSession.findOne({ clientTxnId: txnId });
    if (!session || String(session.user) !== String(userId)) return null;
    return {
      settled: !OPEN_ORDER_STATUSES.includes(session.status),
      paymentMethod: session.paymentMethod,
      baseAmount: Math.max(0, Number(session.total || 0) - (Number(session.walletAmount) || 0)),
      description: 'Cart checkout',
      persist: async (created) => {
        session.gatewayOrderId = created.orderId;
        session.gatewayAmount = created.chargedAmount;
        await session.save();
      },
    };
  }

  const order = await Order.findOne({ clientTxnId: txnId });
  if (!order || String(order.user) !== String(userId)) return null;
  return {
    settled: !OPEN_ORDER_STATUSES.includes(order.status),
    paymentMethod: order.paymentMethod,
    baseAmount: Math.max(
      0,
      Number(order.price || 0) - (Number(order.paymentDetails?.walletAmount) || 0)
    ),
    description: `${order.productName || 'Order'} - ${order.memory || ''}`.trim(),
    persist: async (created) => {
      order.gatewayOrderId = created.orderId;
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        gatewayAmount: created.chargedAmount,
        upiProvider: UPI_PROVIDER_VYAPAR,
        upiExpiresAt: created.expiresAt,
      };
      order.markModified('paymentDetails');
      await order.save();
    },
  };
}
