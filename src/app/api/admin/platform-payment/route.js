import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';
import { requireAdmin } from '@/lib/adminAuth';
import {
  getPlatformPaymentSettings,
  setPlatformPaymentSettings,
  getPublicPlatformPaymentConfig,
} from '@/lib/platformPaymentSettings';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const settings = await getPlatformPaymentSettings();
    return NextResponse.json({
      success: true,
      ...getPublicPlatformPaymentConfig(settings),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const adminUser = await requireAdmin(request);
    const body = await request.json();
    const primaryGateway = body?.primaryGateway;

    if (!['upi', 'razorpay'].includes(primaryGateway)) {
      return NextResponse.json(
        { success: false, message: 'primaryGateway must be upi or razorpay' },
        { status: 400 }
      );
    }

    const settings = await setPlatformPaymentSettings({ primaryGateway }, adminUser?._id);

    return NextResponse.json({
      success: true,
      message:
        primaryGateway === 'upi'
          ? 'All customers will be redirected to UPI first'
          : 'All customers will be redirected to Razorpay first',
      ...getPublicPlatformPaymentConfig(settings),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
