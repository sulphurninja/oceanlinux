import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { verifyVyaparWebhook, getVyaparWebhookSignature } from '@/lib/vyaparGateway';
import { getVyaparCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import {
  findDispatchTarget,
  confirmRechargeFromWebhook,
  confirmCheckoutFromWebhook,
  confirmResellerRechargeFromWebhook,
} from '@/lib/paymentDispatch';
import { verifyUPIPayment, UPI_PROVIDER_VYAPAR } from '@/lib/paymentGateways';
import { confirmPendingOrderPayment } from '@/lib/confirmPendingOrderPayment';
import {
  paymentAmountsMatchExact,
  expectedRenewalGatewayAmount,
  expectedGatewayAmountFromOrder,
} from '@/lib/paymentAmountValidation';
import { logKwikRaw } from '@/lib/kwikRawLog';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * VyaparGateway webhook for customer payments (buy-now, cart, wallet, renewals).
 *
 * The gateway only fires payment.success once a credit matching the requested
 * amount to the paise has settled, so the amount comparisons here are strict.
 * Every payload is still re-verified against the status API before anything is
 * provisioned — a valid signature proves origin, not that the payment cleared.
 */
export async function POST(request) {
  const throttled = enforceRateLimit(request, { max: 120, windowMs: 60_000, scope: 'ip' });
  if (throttled) return throttled;

  await connectDB();

  try {
    const rawBody = await request.text();
    const { signature, timestamp } = getVyaparWebhookSignature(request.headers);

    const settings = await getResellerRechargeSettings();
    const vyapar = getVyaparCredentials(settings);
    if (!vyapar) {
      return NextResponse.json({ success: false, message: 'UPI not configured' }, { status: 400 });
    }

    let data = {};
    try {
      data = JSON.parse(rawBody || '{}');
    } catch {
      data = {};
    }

    // With no secret stored the payload can't be authenticated, so it is treated
    // as nothing more than a hint to go and look. That is safe because a payment
    // is never confirmed from the webhook body alone — the status API below is
    // the sole source of truth — but a signature is still required whenever a
    // secret exists, so a configured install cannot be downgraded by an attacker
    // stripping the header.
    const signatureRequired = !!vyapar.webhookSecret;
    const check = signatureRequired
      ? verifyVyaparWebhook({ rawBody, signature, timestamp, secret: vyapar.webhookSecret })
      : { valid: false, reason: 'no webhook secret configured' };

    await logKwikRaw({
      source: 'webhook',
      gateway: UPI_PROVIDER_VYAPAR,
      paymentId: data.order_id || '',
      orderId: data.client_txn_id || '',
      reportedStatus: data.status || data.event || '',
      reportedAmount: data.amount,
      signatureValid: check.valid,
      raw: data,
      note: check.valid ? '' : check.reason,
    });

    if (signatureRequired && !check.valid) {
      return NextResponse.json({ success: false, message: check.reason }, { status: 400 });
    }

    const event = String(data.event || '').toLowerCase();
    const status = String(data.status || '').toLowerCase();
    const clientTxnId = data.client_txn_id || '';
    const vyaparOrderId = data.order_id || '';
    const upiTxnId = data.upi_txn_id || '';
    const amount = Number(data.amount) || 0;

    if (event !== 'payment.success' && status !== 'success') {
      return NextResponse.json({ success: true, message: `Ignored — ${event || status || 'unknown event'}` });
    }

    if (clientTxnId.startsWith('RENEWAL_')) {
      return handleRenewal({ clientTxnId, vyaparOrderId, upiTxnId, amount });
    }

    const dispatch = await findDispatchTarget(clientTxnId);
    if (dispatch) {
      return handleDispatch({ dispatch, clientTxnId, vyaparOrderId, upiTxnId, amount });
    }

    const order = await Order.findOne({ clientTxnId });
    if (!order) {
      return NextResponse.json({ success: true, message: 'No matching record — ignored' });
    }

    if (order.status === 'confirmed' || order.status === 'active') {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    const verification = await verifyUPIPayment(
      clientTxnId,
      vyaparOrderId || order.gatewayOrderId,
      UPI_PROVIDER_VYAPAR
    );
    if (!verification.verified) {
      return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 });
    }

    const expectedAmount = expectedGatewayAmountFromOrder(order);
    const paidAmount = verification.amount || amount;
    if (expectedAmount > 0 && !paymentAmountsMatchExact(paidAmount, expectedAmount)) {
      return NextResponse.json(
        { success: false, message: `Amount mismatch: expected ${expectedAmount}, got ${paidAmount}` },
        { status: 400 }
      );
    }

    const result = await confirmPendingOrderPayment(order, {
      success: true,
      method: 'upi',
      transactionId: verification.upi_txn_id || upiTxnId || vyaparOrderId,
      gatewayOrderId: vyaparOrderId || order.gatewayOrderId,
      paymentDetails: {
        upi_txn_id: verification.upi_txn_id || upiTxnId,
        upiProvider: UPI_PROVIDER_VYAPAR,
        vyaparOrderId,
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

async function handleRenewal({ clientTxnId, vyaparOrderId, upiTxnId, amount }) {
  const pendingOrder = await Order.findOne({ 'pendingRenewal.renewalTxnId': clientTxnId });
  if (!pendingOrder) {
    return NextResponse.json({ success: true, message: 'Renewal not found — ignored' });
  }

  const verification = await verifyUPIPayment(clientTxnId, vyaparOrderId, UPI_PROVIDER_VYAPAR);
  if (!verification.verified) {
    return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 });
  }

  const expected = expectedRenewalGatewayAmount(pendingOrder);
  const paidAmount = verification.amount || amount;
  if (expected > 0 && !paymentAmountsMatchExact(paidAmount, expected)) {
    return NextResponse.json(
      { success: false, message: `Amount mismatch: expected ${expected}, got ${paidAmount}` },
      { status: 400 }
    );
  }

  const { handleRenewalWebhook } = await import('@/app/api/payment/webhook/route.js');
  return handleRenewalWebhook(
    clientTxnId,
    {
      order: { order_id: clientTxnId },
      payment: {
        cf_payment_id: verification.upi_txn_id || upiTxnId || vyaparOrderId,
        payment_amount: paidAmount,
        payment_status: 'SUCCESS',
        payment_method: 'upi',
      },
    },
    Date.now()
  );
}

async function handleDispatch({ dispatch, clientTxnId, vyaparOrderId, upiTxnId, amount }) {
  const verification = await verifyUPIPayment(clientTxnId, vyaparOrderId, UPI_PROVIDER_VYAPAR);
  if (!verification.verified) {
    return NextResponse.json({ success: false, message: 'Verification failed' }, { status: 400 });
  }

  const expectedAmount = dispatch.kind === 'checkout' ? dispatch.doc.gatewayAmount : dispatch.doc.amount;
  const paidAmount = verification.amount || amount;
  if (expectedAmount && !paymentAmountsMatchExact(paidAmount, expectedAmount)) {
    return NextResponse.json(
      { success: false, message: `Amount mismatch: expected ${expectedAmount}, got ${paidAmount}` },
      { status: 400 }
    );
  }

  const transactionId = verification.upi_txn_id || upiTxnId || vyaparOrderId;
  const sharedDetails = {
    upi_txn_id: verification.upi_txn_id || upiTxnId,
    upiProvider: UPI_PROVIDER_VYAPAR,
    vyaparOrderId,
    verifiedAmount: paidAmount,
    confirmedAt: new Date(),
    webhook: true,
  };

  const confirmers = {
    checkout: confirmCheckoutFromWebhook,
    recharge: confirmRechargeFromWebhook,
    reseller_recharge: confirmResellerRechargeFromWebhook,
  };

  const confirm = confirmers[dispatch.kind];
  if (!confirm) {
    return NextResponse.json({ success: true, message: 'Unsupported record — ignored' });
  }

  const result = await confirm(dispatch.doc, {
    paymentMethod: 'upi',
    transactionId,
    paymentDetails: sharedDetails,
  });

  return NextResponse.json({ success: !!result.success, ...result });
}
