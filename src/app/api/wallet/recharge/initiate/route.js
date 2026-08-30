import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { createGatewayOrder, buildClientTxnId } from '@/lib/paymentGateways';
import { getPrimaryPaymentMethod } from '@/lib/platformPaymentSettings';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

const MIN_RECHARGE = 50;
const MAX_RECHARGE = 100000;

/**
 * POST /api/wallet/recharge/initiate
 * Body: { amount: number, gateway?: 'razorpay' | 'cashfree' | 'upi' }
 *
 * Persists a `WalletRecharge(status='pending')` and creates a gateway
 * order using the same UPI→Cashfree→Razorpay fallback chain as
 * /api/payment/create. Returns a structured payload the frontend SDKs
 * (Razorpay / Cashfree / UPI) can consume verbatim.
 *
 * The caller must hand the returned `clientTxnId` to /payment/callback
 * with `?type=wallet` so the callback page can route to recharge confirm.
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
  if (!user) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  if (user.userType === 'reseller') {
    return NextResponse.json(
      {
        success: false,
        message: 'Reseller accounts must recharge via Reseller Console → Wallet. Customer wallet top-ups are not available for reseller accounts.',
        redirectTo: '/dashboard/reseller-wallet',
      },
      { status: 403 }
    );
  }

  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount < MIN_RECHARGE || amount > MAX_RECHARGE) {
    return NextResponse.json(
      { success: false, message: `Amount must be between ₹${MIN_RECHARGE} and ₹${MAX_RECHARGE}` },
      { status: 400 }
    );
  }

  const primaryGateway = await getPrimaryPaymentMethod();
  const requestedGateway = ['razorpay', 'upi'].includes(body?.gateway) ? body.gateway : primaryGateway;

  const clientTxnId = buildClientTxnId('WALLET');

  // Create the DB row FIRST so a webhook racing the gateway response
  // always finds the recharge to dispatch on.
  const recharge = await WalletRecharge.create({
    user: userId,
    amount: Math.round(amount),
    currency: 'INR',
    clientTxnId,
    paymentMethod: requestedGateway,
    status: 'pending',
  });

  let gatewayResult;
  try {
    gatewayResult = await createGatewayOrder({
      preferredMethod: requestedGateway,
      clientTxnId,
      amount: Math.round(amount),
      customer: {
        id: userId,
        name: user.name,
        email: user.email,
        phone: user.phone || '9999999999',
      },
      callbackPath: '/payment/callback?type=wallet',
      notifyPath: '/api/payment/webhook',
      notes: {
        purpose: 'wallet_recharge',
        recharge_id: String(recharge._id),
      },
      description: `Wallet recharge ₹${Math.round(amount)}`,
    });
  } catch (err) {
    recharge.status = 'failed';
    recharge.failureReason = err.message;
    await recharge.save();
    return NextResponse.json(
      { success: false, message: 'Failed to create gateway order', error: err.message },
      { status: 500 }
    );
  }

  recharge.gatewayOrderId = gatewayResult.gatewayOrderId;
  recharge.paymentMethod = gatewayResult.method;
  // A UPI order may be issued a few paise higher so the gateway can distinguish
  // concurrent same-priced payments. Crediting the charged figure keeps the
  // wallet in step with what actually leaves the customer's bank.
  const payableAmount = Number(gatewayResult.chargedAmount) || Math.round(amount);
  recharge.amount = payableAmount;
  await recharge.save();

  return NextResponse.json({
    success: true,
    message: 'Recharge initiated',
    rechargeId: recharge._id,
    clientTxnId,
    amount: payableAmount,
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
