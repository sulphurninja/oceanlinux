import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import { verifyKwikUpiWebhook } from '@/lib/kwikUpi';
import { getKwikUpiCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { confirmResellerRechargeRequest } from '@/lib/resellerRechargeService';
import { logKwikRaw } from '@/lib/kwikRawLog';

export const runtime = 'nodejs';

/**
 * KwikUPI webhook — auto credit reseller wallet on TXN_SUCCESS.
 * Set this URL in KwikUPI dashboard.
 */
export async function POST(request) {
  await connectDB();

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-webhook-signature') || '';

    const settings = await getResellerRechargeSettings();
    const kwikupi = getKwikUpiCredentials(settings);
    if (!kwikupi) {
      return NextResponse.json({ success: false, message: 'KwikUPI not configured' }, { status: 400 });
    }

    const signatureValid = verifyKwikUpiWebhook(rawBody, signature, kwikupi.apiSecret);

    // Captured before any branching so partial-payment diagnostics survive even
    // when the payload is rejected or has no matching recharge request.
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
      raw: parsedForLog,
      note: 'reseller recharge webhook',
    });

    if (!signatureValid) {
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 400 });
    }

    const data = parsedForLog;
    const status = String(data.status || '').toUpperCase();
    const orderId = data.order_id || '';
    const paymentId = data.payment_id || '';
    const transactionId = data.transaction_id || data.txn_id || '';

    if (status !== 'TXN_SUCCESS' && status !== 'SUCCESS' && status !== 'PAID') {
      return NextResponse.json({ success: true, message: 'Ignored — not success' });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      $or: [
        { clientTxnId: orderId },
        { kwikUpiPaymentId: paymentId },
        { gatewayOrderId: paymentId },
      ],
      method: 'kwikupi',
    });

    if (!reqDoc) {
      return NextResponse.json({ success: true, message: 'Recharge request not found — ignored' });
    }

    const amount = Number(data.amount) || 0;
    if (amount && Math.abs(amount - reqDoc.amount) > 1) {
      return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
    }

    const result = await confirmResellerRechargeRequest(reqDoc, {
      paymentMethod: 'kwikupi',
      transactionId,
      paymentDetails: {
        kwikUpiPaymentId: paymentId,
        kwikUpiTxnId: transactionId,
        verifiedAmount: amount,
        confirmedAt: new Date(),
        webhook: true,
      },
    });

    return NextResponse.json({
      success: true,
      alreadyProcessed: !!result.alreadyProcessed,
      newBalance: result.newBalance,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
