import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { fixAllRenewalStockLinks, auditRenewalPricing } from '@/lib/orderRenewalPricingServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/fix-renewal-stock
 * Re-link orders to the correct IP stock when product was renamed/re-priced.
 * Body: { dryRun?: boolean, limit?: number }
 */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const auditOnly = body?.auditOnly === true;
    const limit = Math.min(Number(body?.limit) || 5000, 5000);

    if (auditOnly) {
      const audit = await auditRenewalPricing({ limit });
      return NextResponse.json({ success: true, auditOnly: true, audit });
    }

    const out = await fixAllRenewalStockLinks({ dryRun, limit });
    const audit = await auditRenewalPricing({ limit: 500 });

    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun
        ? `Found ${out.count} order(s) that would be re-linked`
        : `Fixed ${out.count} order(s) — next renewal uses current rate − promo`,
      audit,
      ...out,
    });
  } catch (error) {
    console.error('[ADMIN/FIX-RENEWAL-STOCK]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Fix failed' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return POST(request);
}
