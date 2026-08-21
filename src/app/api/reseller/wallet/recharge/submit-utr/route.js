import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import { isValidUtr, normalizeUtr } from '@/lib/resellerRechargeUpi';

export async function POST(request) {
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
    const requestId = body?.requestId;
    const utr = normalizeUtr(body?.utr);

    if (!requestId) {
      return NextResponse.json({ success: false, message: 'requestId is required' }, { status: 400 });
    }
    if (!isValidUtr(utr)) {
      return NextResponse.json({ success: false, message: 'Enter a valid UTR (8–22 characters)' }, { status: 400 });
    }

    const reqDoc = await ResellerRechargeRequest.findOne({
      _id: requestId,
      reseller: user.resellerId,
      method: 'manual_upi',
    });

    if (!reqDoc) {
      return NextResponse.json({ success: false, message: 'Recharge request not found' }, { status: 404 });
    }

    if (reqDoc.status === 'confirmed') {
      return NextResponse.json({ success: true, message: 'Already confirmed', status: reqDoc.status });
    }

    if (!['pending_payment', 'awaiting_approval'].includes(reqDoc.status)) {
      return NextResponse.json({ success: false, message: `Request is ${reqDoc.status}` }, { status: 400 });
    }

    const duplicate = await ResellerRechargeRequest.findOne({
      utr,
      _id: { $ne: reqDoc._id },
      status: { $in: ['awaiting_approval', 'confirmed', 'processing'] },
    });
    if (duplicate) {
      return NextResponse.json({ success: false, message: 'This UTR was already submitted' }, { status: 400 });
    }

    reqDoc.utr = utr;
    reqDoc.utrSubmittedAt = new Date();
    reqDoc.status = 'awaiting_approval';
    await reqDoc.save();

    return NextResponse.json({
      success: true,
      message: 'UTR submitted — admin will verify and credit your wallet',
      request: {
        _id: reqDoc._id,
        status: reqDoc.status,
        utr: reqDoc.utr,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
