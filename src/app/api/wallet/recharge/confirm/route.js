import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import WalletRecharge from '@/models/walletRechargeModel';
import userWalletService from '@/services/userWalletService';
import { verifyRazorpaySignature } from '@/lib/paymentGateways';
import {
  confirmRechargeFromWebhook,
  probeWalletRechargePayment,
} from '@/lib/paymentDispatch';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

/**
 * POST /api/wallet/recharge/confirm
 *
 * Body (Razorpay):
 *   { clientTxnId, razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * Body (Cashfree / UPI poll / recovery):
 *   { clientTxnId }
 *
 * Idempotent: if the recharge is already 'confirmed' we return success
 * without double-crediting. The webhook may have raced this endpoint.
 */
export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const { clientTxnId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body || {};
  if (!clientTxnId) {
    return NextResponse.json({ success: false, message: 'clientTxnId is required' }, { status: 400 });
  }

  let tokenUserId;
  try {
    tokenUserId = await getDataFromToken(request);
  } catch {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const recharge = await WalletRecharge.findOne({ clientTxnId });
  if (!recharge) {
    return NextResponse.json({ success: false, message: 'Recharge not found' }, { status: 404 });
  }

  if (String(recharge.user) !== String(tokenUserId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  if (recharge.status === 'confirmed') {
    const newBalance = await userWalletService.getBalance(recharge.user);
    return NextResponse.json({
      success: true,
      message: 'Recharge already confirmed',
      alreadyProcessed: true,
      rechargeId: recharge._id,
      amount: recharge.amount,
      newBalance,
    });
  }

  if (recharge.status === 'failed') {
    return NextResponse.json({
      success: false,
      message: 'Recharge already marked failed',
      reason: recharge.failureReason,
    }, { status: 400 });
  }

  let paymentMethod = recharge.paymentMethod;
  let transactionId = '';
  let paymentDetails = {};

  if (
    recharge.paymentMethod === 'razorpay' &&
    razorpay_payment_id &&
    razorpay_order_id &&
    razorpay_signature &&
    recharge.gatewayOrderId
  ) {
    const ok = verifyRazorpaySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      expectedOrderId: recharge.gatewayOrderId,
    });
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Razorpay signature verification failed' }, { status: 400 });
    }
    transactionId = razorpay_payment_id;
    paymentDetails = {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      confirmedAt: new Date(),
    };
  } else {
    const probe = await probeWalletRechargePayment(recharge);
    if (!probe.verified) {
      return NextResponse.json({
        success: false,
        message: probe.reason || 'Payment not verified yet',
      }, { status: 400 });
    }
    paymentMethod = probe.gateway;
    transactionId = probe.transactionId;
    paymentDetails = probe.paymentDetails;
  }

  const result = await confirmRechargeFromWebhook(recharge, {
    paymentMethod,
    transactionId,
    paymentDetails,
  });

  if (!result.success) {
    return NextResponse.json({
      success: false,
      message: result.error || result.reason || 'Failed to credit wallet',
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: result.alreadyProcessed ? 'Recharge already confirmed' : 'Wallet recharged successfully',
    alreadyProcessed: !!result.alreadyProcessed,
    rechargeId: recharge._id,
    amount: recharge.amount,
    newBalance: result.newBalance,
    walletTxnId: result.walletTxnId,
  });
}
