import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';

/** Reseller ki apni recharge history (pending / confirmed / failed sab) */
export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const items = await ResellerRechargeRequest.find({ reseller: user.resellerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        'amount method status clientTxnId transactionId payeeName failureReason rejectionReason creditedAt createdAt utr'
      )
      .lean();

    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
