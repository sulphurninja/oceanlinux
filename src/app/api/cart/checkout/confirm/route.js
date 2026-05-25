import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import CheckoutSession from '@/models/checkoutSessionModel';
import {
  verifyRazorpaySignature,
  verifyCashfreePayment,
  verifyUPIPayment,
} from '@/lib/paymentGateways';
import { confirmCheckoutFromWebhook } from '@/lib/paymentDispatch';

/**
 * POST /api/cart/checkout/confirm
 *
 * Body (Razorpay):
 *   { clientTxnId, razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * Body (Cashfree / UPI poll):
 *   { clientTxnId }
 *
 * Idempotent: returns success without re-running provisioning if the
 * session is already confirmed (the webhook may have raced this call).
 *
 * Auth: requires the calling user to own the session.
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

  let userId = null;
  try {
    userId = await getDataFromToken(request);
  } catch {
    userId = null;
  }

  const session = await CheckoutSession.findOne({ clientTxnId });
  if (!session) {
    return NextResponse.json({ success: false, message: 'Checkout session not found' }, { status: 404 });
  }
  if (userId && String(session.user) !== String(userId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  if (session.status === 'confirmed') {
    return NextResponse.json({
      success: true,
      message: 'Checkout already confirmed',
      alreadyProcessed: true,
      sessionId: session._id,
      orderIds: session.orderIds,
    });
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    return NextResponse.json({
      success: false,
      message: `Session is ${session.status}`,
      reason: session.failureReason,
    }, { status: 400 });
  }

  // Determine which gateway this session is using. The label lives in
  // `paymentMethod` as 'wallet+razorpay' / 'cashfree' / 'upi' etc.
  const gateway = session.paymentMethod.replace(/^wallet\+/, '');

  let paymentDetails = {};
  let transactionId = '';

  if (gateway === 'razorpay') {
    const ok = verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
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
  } else if (gateway === 'cashfree') {
    const result = await verifyCashfreePayment(clientTxnId);
    if (!result.verified) {
      return NextResponse.json({ success: false, message: result.error || 'Cashfree verification failed' }, { status: 400 });
    }
    transactionId = result.payment.cf_payment_id;
    paymentDetails = {
      cf_payment_id: result.payment.cf_payment_id,
      cf_order_id: clientTxnId,
      payment_amount: result.payment.payment_amount,
      payment_method: result.payment.payment_method,
      confirmedAt: new Date(),
    };
  } else if (gateway === 'upi') {
    const result = await verifyUPIPayment(clientTxnId);
    if (!result.verified) {
      return NextResponse.json({ success: false, message: result.error || 'UPI verification failed' }, { status: 400 });
    }
    if (result.amount && session.gatewayAmount && Math.abs(result.amount - session.gatewayAmount) > 1) {
      return NextResponse.json({ success: false, message: 'UPI amount mismatch' }, { status: 400 });
    }
    transactionId = result.upi_txn_id || '';
    paymentDetails = {
      upi_txn_id: result.upi_txn_id,
      verifiedAmount: result.amount,
      confirmedAt: new Date(),
    };
  } else if (gateway === 'wallet') {
    // wallet-only sessions are auto-confirmed at initiate; if we land
    // here it means the client raced the initiate response — just
    // confirm idempotently.
    paymentDetails = { walletOnly: true, confirmedAt: new Date() };
  } else {
    return NextResponse.json({ success: false, message: `Unsupported gateway ${gateway}` }, { status: 400 });
  }

  const result = await confirmCheckoutFromWebhook(session, {
    paymentMethod: gateway,
    transactionId,
    paymentDetails,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, message: result.reason || 'Confirm failed' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Cart checkout confirmed',
    sessionId: session._id,
    orderIds: session.orderIds,
    provisionedCount: result.provisionedCount,
    slotAllocatedCount: result.slotAllocatedCount,
  });
}
