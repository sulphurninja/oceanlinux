import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import WalletRecharge from '@/models/walletRechargeModel';
import userWalletService from '@/services/userWalletService';
import {
  verifyRazorpaySignature,
  verifyCashfreePayment,
  verifyUPIPayment,
} from '@/lib/paymentGateways';

/**
 * POST /api/wallet/recharge/confirm
 *
 * Body (Razorpay):
 *   { clientTxnId, razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * Body (Cashfree / UPI poll):
 *   { clientTxnId }
 *
 * Idempotent: if the recharge is already 'confirmed' we return success
 * without double-crediting. The webhook may have raced this endpoint.
 *
 * On success: marks the recharge confirmed, credits the user wallet via
 * `userWalletService.credit`, links `walletTxnId` for audit.
 */
export async function POST(request) {
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

  // Auth is optional here because Razorpay's frontend handler also calls
  // it after redirect, but we still try to bind to the user from token.
  let tokenUserId = null;
  try {
    tokenUserId = await getDataFromToken(request);
  } catch {
    tokenUserId = null;
  }

  const recharge = await WalletRecharge.findOne({ clientTxnId });
  if (!recharge) {
    return NextResponse.json({ success: false, message: 'Recharge not found' }, { status: 404 });
  }

  if (tokenUserId && String(recharge.user) !== String(tokenUserId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  // Idempotency.
  if (recharge.status === 'confirmed') {
    return NextResponse.json({
      success: true,
      message: 'Recharge already confirmed',
      alreadyProcessed: true,
      rechargeId: recharge._id,
    });
  }

  if (recharge.status === 'failed') {
    return NextResponse.json({
      success: false,
      message: 'Recharge already marked failed',
      reason: recharge.failureReason,
    }, { status: 400 });
  }

  // Verify by paymentMethod.
  if (recharge.paymentMethod === 'razorpay') {
    const ok = verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Razorpay signature verification failed' }, { status: 400 });
    }
    recharge.transactionId = razorpay_payment_id;
    recharge.gatewayOrderId = razorpay_order_id;
    recharge.paymentDetails = {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      confirmedAt: new Date(),
    };
  } else if (recharge.paymentMethod === 'cashfree') {
    const result = await verifyCashfreePayment(clientTxnId);
    if (!result.verified) {
      return NextResponse.json({ success: false, message: result.error || 'Cashfree verification failed' }, { status: 400 });
    }
    recharge.transactionId = result.payment.cf_payment_id;
    recharge.paymentDetails = {
      cf_payment_id: result.payment.cf_payment_id,
      cf_order_id: clientTxnId,
      payment_amount: result.payment.payment_amount,
      payment_method: result.payment.payment_method,
      confirmedAt: new Date(),
    };
  } else if (recharge.paymentMethod === 'upi') {
    const result = await verifyUPIPayment(clientTxnId);
    if (!result.verified) {
      return NextResponse.json({ success: false, message: result.error || 'UPI verification failed' }, { status: 400 });
    }
    if (result.amount && Math.abs(result.amount - recharge.amount) > 1) {
      return NextResponse.json({ success: false, message: 'UPI amount mismatch' }, { status: 400 });
    }
    recharge.transactionId = result.upi_txn_id || '';
    recharge.paymentDetails = {
      upi_txn_id: result.upi_txn_id,
      verified: true,
      verifiedAmount: result.amount,
      confirmedAt: new Date(),
    };
  } else {
    return NextResponse.json({ success: false, message: 'Unknown payment method on recharge' }, { status: 400 });
  }

  // Credit wallet via the shared service.
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
    console.error('[wallet recharge confirm] credit failed:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to credit wallet', error: err.message },
      { status: 500 }
    );
  }

  recharge.status = 'confirmed';
  recharge.creditedAt = new Date();
  recharge.walletTxnId = creditResult.walletTxnId;
  await recharge.save();

  return NextResponse.json({
    success: true,
    message: 'Wallet recharged successfully',
    rechargeId: recharge._id,
    amount: recharge.amount,
    newBalance: creditResult.balanceAfter,
    walletTxnId: creditResult.walletTxnId,
  });
}
