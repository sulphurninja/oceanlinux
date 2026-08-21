import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import {
  confirmResellerRechargeRequest,
  probePaytmResellerRecharge,
  probeKwikUpiResellerRecharge,
} from '@/lib/resellerRechargeService';
import ResellerWalletService from '@/services/resellerWalletService';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

async function probeAndConfirm(reqDoc) {
  let probe;
  if (reqDoc.method === 'kwikupi') {
    probe = await probeKwikUpiResellerRecharge(reqDoc);
  } else {
    probe = await probePaytmResellerRecharge(reqDoc);
  }
  if (!probe.verified) {
    return { ok: false, probe };
  }
  const result = await confirmResellerRechargeRequest(reqDoc, {
    paymentMethod: reqDoc.method === 'kwikupi' ? 'kwikupi' : 'paytm',
    transactionId: probe.transactionId,
    paymentDetails: probe.paymentDetails,
  });
  return { ok: result.success, result, probe };
}

export async function GET(request, { params }) {
  await connectDB();
  const { id } = await params;

  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId).select('userType resellerId');
    if (!user || user.userType !== 'reseller' || !user.resellerId) {
      return NextResponse.json({ success: false, message: 'Reseller access required' }, { status: 403 });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      _id: id,
      reseller: user.resellerId,
    }).lean();

    if (!reqDoc) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }

    let newBalance = null;
    if (reqDoc.status === 'confirmed') {
      const wallet = await ResellerWalletService.getWalletDetails(user.resellerId);
      newBalance = wallet.balance;
    }

    return NextResponse.json({
      success: true,
      request: reqDoc,
      newBalance,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/** Poll Paytm status and auto-credit wallet when paid */
export async function POST(request, { params }) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();
  const { id } = await params;

  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId).select('userType resellerId');
    if (!user || user.userType !== 'reseller' || !user.resellerId) {
      return NextResponse.json({ success: false, message: 'Reseller access required' }, { status: 403 });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      _id: id,
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
        status: 'confirmed',
        newBalance: wallet.balance,
      });
    }

    const outcome = await probeAndConfirm(reqDoc);
    if (!outcome.ok) {
      return NextResponse.json({
        success: false,
        message: outcome.probe?.reason || 'Payment not detected yet',
        status: reqDoc.status,
        pending: outcome.probe?.pending,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: outcome.result?.alreadyProcessed ? 'Already credited' : 'Wallet recharged successfully',
      alreadyProcessed: !!outcome.result?.alreadyProcessed,
      newBalance: outcome.result?.newBalance,
      status: 'confirmed',
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
