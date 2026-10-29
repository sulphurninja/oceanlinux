import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import { confirmResellerRechargeRequest, probeUpiGatewayResellerRecharge } from '@/lib/resellerRechargeService';

export const runtime = 'nodejs';

/**
 * Dashboard webhook. The body is not trusted. Credit only after
 * check_order_status says this client_txn_id was paid for the stored amount.
 */
export async function POST(request) {
  await connectDB();

  try {
    const contentType = request.headers.get('content-type') || '';
    let data = {};
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      data = Object.fromEntries(form.entries());
    } else {
      data = await request.json().catch(() => ({}));
    }
    const clientTxnId = String(
      data.client_txn_id || data.clientTxnId || data.udf1 || data.order_id || ''
    ).trim();

    if (!clientTxnId) {
      return NextResponse.json({ status: true, success: true, message: 'Ignored' });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      clientTxnId,
      method: 'upigateway',
    });

    if (!reqDoc) {
      return NextResponse.json({ status: true, success: true, message: 'Recharge request not found — ignored' });
    }

    if (reqDoc.status === 'confirmed') {
      return NextResponse.json({ status: true, success: true, alreadyProcessed: true });
    }

    const probe = await probeUpiGatewayResellerRecharge(reqDoc);
    if (!probe.verified) {
      return NextResponse.json({ status: true, success: true, message: probe.reason || 'Not paid yet' });
    }

    const result = await confirmResellerRechargeRequest(reqDoc, {
      paymentMethod: 'upigateway',
      transactionId: probe.transactionId,
      paymentDetails: probe.paymentDetails,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.reason || 'Credit failed' }, { status: 500 });
    }

    return NextResponse.json({ status: true, success: true, alreadyProcessed: !!result.alreadyProcessed });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Webhook failed' }, { status: 500 });
  }
}
