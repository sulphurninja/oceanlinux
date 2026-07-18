import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { requireAdmin } from '@/lib/adminAuth';
const { buildAdminPaymentDashboard } = require('@/lib/adminPaymentDashboard');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 7), 90);

    const dashboard = await buildAdminPaymentDashboard(Order, WalletRecharge, { days });

    return NextResponse.json(dashboard, { headers: NO_CACHE });
  } catch (error: any) {
    console.error('[ADMIN/PAYMENT-DASHBOARD] Error:', error);
    return NextResponse.json(
      { message: 'Failed to load payment dashboard', error: error.message },
      { status: 500, headers: NO_CACHE }
    );
  }
}
