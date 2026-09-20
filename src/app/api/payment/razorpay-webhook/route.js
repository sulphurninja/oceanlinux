import { NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { confirmPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import {
  findDispatchTarget,
  confirmCheckoutFromWebhook,
  confirmRechargeFromWebhook,
} from '@/lib/paymentDispatch';
const PaymentOrderLogger = require('@/services/paymentOrderLogger');

/**
 * Razorpay webhook — confirms orders when payment.captured fires.
 * Configure in Razorpay Dashboard → Webhooks → payment.captured
 * Set RAZORPAY_WEBHOOK_SECRET in .env
 */
export async function POST(request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[RAZORPAY-WEBHOOK] RAZORPAY_WEBHOOK_SECRET not set — ignoring');
    return NextResponse.json({ success: true, message: 'Webhook secret not configured' });
  }

  const body = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  if (!signature) {
    return NextResponse.json({ success: false, message: 'Missing signature' }, { status: 400 });
  }

  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (expected !== signature) {
    console.error('[RAZORPAY-WEBHOOK] Invalid signature');
    return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  await connectDB();

  const eventType = event.event;
  console.log(`[RAZORPAY-WEBHOOK] Event: ${eventType}`);

  if (eventType !== 'payment.captured' && eventType !== 'order.paid') {
    return NextResponse.json({ success: true, message: 'Event ignored' });
  }

  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
  const paymentId = paymentEntity?.id;
  const receipt = orderEntity?.receipt || paymentEntity?.notes?.receipt;

  if (!razorpayOrderId && !receipt) {
    return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
  }

  const txnRef = receipt || razorpayOrderId;

  // Guard: never confirm/credit anything (order, cart checkout, or wallet
  // recharge) without a real captured payment id. `order.paid` can arrive
  // without a payment entity; acting on it would deliver a server / credit a
  // wallet without an actual payment.
  if (!paymentId) {
    const logger = PaymentOrderLogger.forTxn(txnRef, 'webhook');
    logger.warning('Razorpay webhook received without captured paymentId — ignoring', {
      event: eventType,
      razorpayOrderId,
      receipt,
    });
    logger.setPaymentInfo({
      method: 'razorpay',
      gatewayStatus: 'PENDING',
      gatewayOrderId: razorpayOrderId,
    });
    await logger.save({ success: false, anomaly: true, errorMessage: 'razorpay_webhook_missing_payment_id' });
    return NextResponse.json(
      { success: false, message: 'Webhook missing captured payment id — ignored' },
      { status: 202 }
    );
  }

  // Cart checkout + wallet recharge use parent docs keyed by clientTxnId.
  const dispatch = await findDispatchTarget(txnRef);
  if (dispatch?.kind === 'checkout') {
    console.log(`[RAZORPAY-WEBHOOK] Cart checkout session matched: ${dispatch.doc._id}`);
    const result = await confirmCheckoutFromWebhook(dispatch.doc, {
      paymentMethod: 'razorpay',
      transactionId: paymentId,
      paymentDetails: {
        razorpay_payment_id: paymentId,
        razorpay_order_id: razorpayOrderId,
        webhookEvent: eventType,
        webhookReceivedAt: new Date(),
      },
    });
    return NextResponse.json({
      success: !!result.success,
      message: 'Cart checkout webhook processed',
      ...result,
    });
  }
  if (dispatch?.kind === 'recharge') {
    console.log(`[RAZORPAY-WEBHOOK] Wallet recharge matched: ${dispatch.doc._id}`);
    const result = await confirmRechargeFromWebhook(dispatch.doc, {
      paymentMethod: 'razorpay',
      transactionId: paymentId,
      paymentDetails: {
        razorpay_payment_id: paymentId,
        razorpay_order_id: razorpayOrderId,
        webhookEvent: eventType,
        webhookReceivedAt: new Date(),
      },
    });
    return NextResponse.json({
      success: !!result.success,
      message: 'Wallet recharge webhook processed',
      ...result,
    });
  }

  // Renewal Razorpay orders use receipt RENEWAL_* (not Order.clientTxnId).
  if (receipt && String(receipt).startsWith('RENEWAL_')) {
    const { handleRenewalWebhook } = await import('@/app/api/payment/webhook/route.js');
    const adaptedPayment = {
      order: { order_id: receipt },
      payment: {
        cf_payment_id: paymentId,
        payment_amount: Number(paymentEntity?.amount ?? orderEntity?.amount ?? 0) / 100,
        payment_status: 'SUCCESS',
        payment_method: paymentEntity?.method || 'razorpay',
      },
    };
    return handleRenewalWebhook(receipt, adaptedPayment, Date.now());
  }

  let order =
    (receipt ? await Order.findOne({ clientTxnId: receipt }) : null) ||
    (razorpayOrderId ? await Order.findOne({ gatewayOrderId: razorpayOrderId }) : null);

  if (!order && razorpayOrderId) {
    const renewalOrder = await Order.findOne({ 'pendingRenewal.gatewayOrderId': razorpayOrderId });
    const renewalTxnId = renewalOrder?.pendingRenewal?.renewalTxnId;
    if (renewalTxnId) {
      const { handleRenewalWebhook } = await import('@/app/api/payment/webhook/route.js');
      const adaptedPayment = {
        order: { order_id: renewalTxnId },
        payment: {
          cf_payment_id: paymentId,
          payment_amount: Number(paymentEntity?.amount ?? orderEntity?.amount ?? 0) / 100,
          payment_status: 'SUCCESS',
          payment_method: paymentEntity?.method || 'razorpay',
        },
      };
      return handleRenewalWebhook(renewalTxnId, adaptedPayment, Date.now());
    }
  }

  if (!order) {
    const logger = PaymentOrderLogger.forTxn(receipt || razorpayOrderId, 'webhook');
    logger.error('Razorpay webhook: payment captured but order not found', {
      event: eventType,
      razorpayOrderId,
      paymentId,
      receipt,
    });
    logger.setPaymentInfo({
      method: 'razorpay',
      gatewayStatus: 'SUCCESS',
      transactionId: paymentId,
      gatewayOrderId: razorpayOrderId,
    });
    await logger.save({ success: false, anomaly: true, errorMessage: 'razorpay_webhook_order_not_found' });
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  const result = await confirmPendingOrderPayment(
    order,
    {
      success: true,
      method: 'razorpay',
      transactionId: paymentId,
      gatewayOrderId: razorpayOrderId,
      paymentDetails: {
        razorpay_payment_id: paymentId,
        razorpay_order_id: razorpayOrderId,
        webhookEvent: eventType,
        webhookReceivedAt: new Date(),
      },
    },
    { logSource: 'webhook' }
  );

  return NextResponse.json({
    success: true,
    confirmed: !!result.confirmed,
    orderId: order._id,
    alreadyProcessed: !!result.alreadyProcessed,
  });
}
