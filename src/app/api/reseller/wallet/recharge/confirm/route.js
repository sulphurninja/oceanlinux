import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import {
  confirmResellerRechargeRequest,
  probePaytmResellerRecharge,
  probeKwikUpiResellerRecharge,
  probeVyaparResellerRecharge,
} from '@/lib/resellerRechargeService';
import ResellerWalletService from '@/services/resellerWalletService';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();

  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId).select('userType resellerId');
    if (!user || user.userType !== 'reseller' || !user.resellerId) {
      return NextResponse.json({ success: false, message: 'Reseller access required' }, { status: 403 });
    }

    const body = await request.json();
    const clientTxnId = String(body?.clientTxnId || '').trim();
    if (!clientTxnId) {
      return NextResponse.json({ success: false, message: 'clientTxnId is required' }, { status: 400 });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      clientTxnId,
      reseller: user.resellerId,
      method: { $in: ['paytm_qr', 'kwikupi'] },
    });

    if (!reqDoc) {
      return NextResponse.json({ success: false, message: 'Recharge request not found' }, { status: 404 });
    }

    if (reqDoc.status === 'confirmed') {
      const wallet = await ResellerWalletService.getWalletDetails(user.resellerId);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        newBalance: wallet.balance,
      });
    }

    const gatewayProbe = {
      vyapar: probeVyaparResellerRecharge,
      kwikupi: probeKwikUpiResellerRecharge,
    }[reqDoc.method];
    const probe = await (gatewayProbe || probePaytmResellerRecharge)(reqDoc);

    if (!probe.verified) {
      return NextResponse.json({
        success: false,
        message: probe.reason || 'Payment not verified yet',
      }, { status: 400 });
    }

    const result = await confirmResellerRechargeRequest(reqDoc, {
      paymentMethod: gatewayProbe ? reqDoc.method : 'paytm',
      transactionId: probe.transactionId,
      paymentDetails: probe.paymentDetails,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.reason || 'Failed to credit wallet' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      alreadyProcessed: !!result.alreadyProcessed,
      newBalance: result.newBalance,
      amount: reqDoc.amount,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
