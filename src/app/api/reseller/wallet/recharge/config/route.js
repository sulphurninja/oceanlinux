import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import {
  getResellerRechargeSettings,
  getPublicResellerRechargeSettings,
} from '@/lib/resellerRechargeSettings';

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

    const settings = await getResellerRechargeSettings();

    return NextResponse.json({
      success: true,
      config: getPublicResellerRechargeSettings(settings),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
