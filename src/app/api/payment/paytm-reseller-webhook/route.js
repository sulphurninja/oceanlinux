import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import {
  confirmResellerRechargeRequest,
  probePaytmResellerRecharge,
} from '@/lib/resellerRechargeService';
import {
  getResellerRechargeSettings,
  getPaytmCredentials,
} from '@/lib/resellerRechargeSettings';
import { verifyPaytmWebhookChecksum } from '@/lib/paytmMerchant';

/**
 * Paytm S2S webhook for reseller wallet recharges.
 * Configure this URL in Paytm Merchant Dashboard.
 */
export async function POST(request) {
  await connectDB();

  try {
    const settings = await getResellerRechargeSettings();
    const paytm = getPaytmCredentials(settings);
    if (!paytm) {
      return NextResponse.json({ success: false, message: 'Paytm not configured' }, { status: 503 });
    }

    let payload;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    }

    const orderId =
      payload?.ORDERID ||
      payload?.orderId ||
      payload?.body?.orderId ||
      payload?.body?.ORDERID;

    const checksum =
      payload?.CHECKSUMHASH ||
      payload?.checksum ||
      payload?.head?.signature;

    if (checksum && payload?.body) {
      const valid = await verifyPaytmWebhookChecksum(payload.body, paytm.merchantKey, checksum);
      if (!valid) {
        return NextResponse.json({ success: false, message: 'Invalid checksum' }, { status: 400 });
      }
    }

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Missing order id' }, { status: 400 });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      clientTxnId: String(orderId),
      method: 'paytm_qr',
    });

    if (!reqDoc) {
      return NextResponse.json({ success: false, message: 'Recharge not found' }, { status: 404 });
    }

    if (reqDoc.status === 'confirmed') {
      return NextResponse.json({ success: true, message: 'Already confirmed' });
    }

    const status =
      payload?.STATUS ||
      payload?.status ||
      payload?.body?.resultInfo?.resultStatus;

    if (status && !['TXN_SUCCESS', 'SUCCESS'].includes(String(status).toUpperCase())) {
      if (['TXN_FAILURE', 'FAILURE'].includes(String(status).toUpperCase())) {
        reqDoc.status = 'failed';
        reqDoc.failureReason = payload?.RESPMSG || payload?.resultMsg || 'Payment failed';
        await reqDoc.save();
      }
      return NextResponse.json({ success: true, message: 'Status noted' });
    }

    const probe = await probePaytmResellerRecharge(reqDoc);
    if (!probe.verified) {
      return NextResponse.json({ success: false, message: probe.reason || 'Not verified' }, { status: 400 });
    }

    await confirmResellerRechargeRequest(reqDoc, {
      paymentMethod: 'paytm',
      transactionId: probe.transactionId,
      paymentDetails: { ...probe.paymentDetails, webhook: true },
    });

    return NextResponse.json({ success: true, message: 'Wallet credited' });
  } catch (error) {
    console.error('[Paytm Reseller Webhook]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
