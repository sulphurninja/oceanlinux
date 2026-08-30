import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { verifyKwikUpiWebhook } from '@/lib/kwikUpi';
import { getKwikUpiCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import {
  findDispatchTarget,
  confirmRechargeFromWebhook,
  confirmCheckoutFromWebhook,
  confirmResellerRechargeFromWebhook,
} from '@/lib/paymentDispatch';
import { verifyUPIPayment } from '@/lib/paymentGateways';
import { confirmPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import { paymentAmountsMatch, expectedRenewalGatewayAmount } from '@/lib/paymentAmountValidation';
import { logKwikRaw } from '@/lib/kwikRawLog';

export const runtime = 'nodejs';

/**
 * KwikUPI webhook for customer payments (wallet, cart, buy-now orders).
 * Register this URL in the KwikUPI dashboard alongside the reseller webhook.
 */
export async function POST(request) {
  await connectDB();

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-webhook-signature') || '';

    const settings = await getResellerRechargeSettings();
    const kwikupi = getKwikUpiCredentials(settings);
    if (!kwikupi) {
      return NextResponse.json({ success: false, message: 'UPI not configured' }, { status: 400 });
    }

    const signatureValid = verifyKwikUpiWebhook(rawBody, signature, kwikupi.apiSecret);

    // Captured before any branching so partial-payment diagnostics survive even
    // when the payload is rejected or has no matching record.
    let parsedForLog = {};
    try {
      parsedForLog = JSON.parse(rawBody || '{}');
    } catch {
      parsedForLog = {};
    }
    await logKwikRaw({
      source: 'webhook',
      paymentId: parsedForLog.payment_id || '',
      orderId: parsedForLog.order_id || '',
      reportedStatus: parsedForLog.status || '',
      reportedAmount: parsedForLog.amount,
      signatureValid,
      headers: {
        'x-webhook-signature': signature ? `${String(signature).slice(0, 12)}…` : '',
        'content-type': request.headers.get('content-type') || '',
      },
      raw: parsedForLog,
    });

    if (!signatureValid) {
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 400 });
    }

    const data = parsedForLog;
    const status = String(data.status || '').toUpperCase();
    const orderId = data.order_id || '';
    const paymentId = data.payment_id || '';
    const transactionId = data.transaction_id || data.txn_id || '';
    const amount = Number(data.amount) || 0;

    if (status !== 'TXN_SUCCESS' && status !== 'SUCCESS' && status !== 'PAID') {
      return NextResponse.json({ success: true, message: 'Ignored — not success' });
    }

    // Renewal payments use RENEWAL_* as KwikUPI order_id (not Order.clientTxnId)
    if (orderId.startsWith('RENEWAL_')) {
      const pendingOrder = await Order.findOne({ 'pendingRenewal.renewalTxnId': orderId });
      if (!pendingOrder) {
        return NextResponse.json({ success: true, message: 'Renewal not found — ignored' });
      }

      const verification = await verifyUPIPayment(orderId, paymentId);
      if (!verification.verified) {
        return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 });
      }

      const expected = expectedRenewalGatewayAmount(pendingOrder);
      const paidAmount = verification.amount || amount;
      if (expected > 0 && !paymentAmountsMatch(paidAmount, expected)) {
        return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
      }

      const { handleRenewalWebhook } = await import('@/app/api/payment/webhook/route.js');
      const adaptedPayment = {
        order: { order_id: orderId },
        payment: {
          cf_payment_id: verification.upi_txn_id || transactionId || paymentId,
          payment_amount: paidAmount,
          payment_status: 'SUCCESS',
          payment_method: 'upi',
        },
      };
      return handleRenewalWebhook(orderId, adaptedPayment, Date.now());
    }

    const dispatch = await findDispatchTarget(orderId);
    if (dispatch) {
      const verification = await verifyUPIPayment(orderId, paymentId);
      if (!verification.verified) {
        return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 });
      }

      const expectedAmount =
        dispatch.kind === 'checkout'
          ? dispatch.doc.gatewayAmount
          : dispatch.doc.amount;
      const paidAmount = verification.amount || amount;
      if (expectedAmount && Math.abs(paidAmount - expectedAmount) > 1) {
        return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
      }

      const sharedDetails = {
        upi_txn_id: verification.upi_txn_id || transactionId,
        kwikUpiPaymentId: paymentId,
        verifiedAmount: paidAmount,
        confirmedAt: new Date(),
        webhook: true,
      };

      if (dispatch.kind === 'checkout') {
        const result = await confirmCheckoutFromWebhook(dispatch.doc, {
          paymentMethod: 'upi',
          transactionId: verification.upi_txn_id || transactionId || paymentId,
          paymentDetails: sharedDetails,
        });
        return NextResponse.json({ success: !!result.success, ...result });
      }

      if (dispatch.kind === 'recharge') {
        const result = await confirmRechargeFromWebhook(dispatch.doc, {
          paymentMethod: 'upi',
          transactionId: verification.upi_txn_id || transactionId || paymentId,
          paymentDetails: sharedDetails,
        });
        return NextResponse.json({ success: !!result.success, ...result });
      }

      if (dispatch.kind === 'reseller_recharge') {
        const result = await confirmResellerRechargeFromWebhook(dispatch.doc, {
          paymentMethod: 'upi',
          transactionId: verification.upi_txn_id || transactionId || paymentId,
          paymentDetails: sharedDetails,
        });
        return NextResponse.json({ success: !!result.success, ...result });
      }
    }

    const order = await Order.findOne({ clientTxnId: orderId });
    if (!order) {
      return NextResponse.json({ success: true, message: 'No matching record — ignored' });
    }

    if (order.status === 'confirmed' || order.status === 'active') {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    const verification = await verifyUPIPayment(orderId, paymentId || order.gatewayOrderId);
    if (!verification.verified) {
      return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 });
    }

    const expectedAmount =
      Number(order.paymentDetails?.gatewayAmount) ||
      Math.max(0, Number(order.price) - (Number(order.walletDeduction?.amount) || 0));
    const paidAmount = verification.amount || amount;
    if (expectedAmount > 0 && Math.abs(paidAmount - expectedAmount) > 1) {
      return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
    }

    const result = await confirmPendingOrderPayment(order, {
      success: true,
      method: 'upi',
      transactionId: verification.upi_txn_id || transactionId || paymentId,
      gatewayOrderId: paymentId || order.gatewayOrderId,
      paymentDetails: {
        upi_txn_id: verification.upi_txn_id || transactionId,
        kwikUpiPaymentId: paymentId,
        verifiedAmount: paidAmount,
        confirmedAt: new Date(),
        webhook: true,
      },
    });

    return NextResponse.json({
      success: !!result.confirmed,
      alreadyProcessed: !!result.alreadyProcessed,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
