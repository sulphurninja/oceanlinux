import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import {
  getPlatformPaymentSettings,
  getPublicPlatformPaymentConfig,
} from '@/lib/platformPaymentSettings';
import {
  getResellerRechargeSettings,
  getKwikUpiCredentials,
  getVyaparCredentials,
} from '@/lib/resellerRechargeSettings';
import { getRazorpayClient } from '@/lib/razorpayClient';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payment/config
 * Public config for customer checkout — which gateway to try first.
 */
export async function GET() {
  await connectDB();

  try {
    const [platformSettings, rechargeSettings] = await Promise.all([
      getPlatformPaymentSettings(),
      getResellerRechargeSettings(),
    ]);

    const upi = !!(getVyaparCredentials(rechargeSettings) || getKwikUpiCredentials(rechargeSettings));
    const razorpay = !!getRazorpayClient();

    return NextResponse.json(
      {
        success: true,
        ...getPublicPlatformPaymentConfig(platformSettings),
        gateways: {
          upi,
          razorpay,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load payment config' },
      { status: 500 }
    );
  }
}
