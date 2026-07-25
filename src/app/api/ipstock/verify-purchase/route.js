import { NextResponse } from 'next/server';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { refreshAndVerifyPurchase } from '@/lib/syncIpStockBeforePurchase';
import { customerStockUnavailableMessage } from '@/lib/customerStockMessages';
import { enforceUserActionRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ipstock/verify-purchase
 * Live-sync ADVPS/SmartVPS stock for one plan before Buy Now / checkout.
 * Body: { ipStockId?, slotIpPackageId?, memory? }
 */
export async function POST(request) {
  let slotIpPackageId;
  try {
    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const rateLimited = enforceUserActionRateLimit(request);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { ipStockId, memory } = body || {};
    slotIpPackageId = body?.slotIpPackageId;

    const result = await refreshAndVerifyPurchase({ ipStockId, slotIpPackageId, memory });

    if (!result.ok) {
      result.message = customerStockUnavailableMessage(result.message, {
        kind: slotIpPackageId ? 'slot' : 'plan',
      });
    }

    return NextResponse.json(result, {
      status: result.ok ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[IPSTOCK/VERIFY-PURCHASE]', error);
    return NextResponse.json(
      {
        ok: false,
        message: customerStockUnavailableMessage(error.message, {
          kind: slotIpPackageId ? 'slot' : 'plan',
        }),
      },
      { status: 409 }
    );
  }
}
