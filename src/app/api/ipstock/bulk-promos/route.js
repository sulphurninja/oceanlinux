import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { enforceAdmin } from '@/lib/apiSecurity';

function normalizePromoInput(promo) {
  const code = String(promo?.code || '').trim().toUpperCase();
  const discount = Number(promo?.discount);
  const discountType = promo?.discountType === 'percentage' ? 'percentage' : 'fixed';

  if (!code) {
    return { error: 'Promo code is required' };
  }
  if (!Number.isFinite(discount) || discount < 0) {
    return { error: `Invalid discount for promo ${code}` };
  }
  if (discountType === 'percentage' && discount > 100) {
    return { error: `Percentage discount for ${code} cannot exceed 100%` };
  }

  return {
    code,
    discount,
    discountType,
    isActive: promo?.isActive !== false,
  };
}

function mergePromoCodes(existing = [], incoming = []) {
  const byCode = new Map();

  for (const promo of existing) {
    const code = String(promo?.code || '').trim().toUpperCase();
    if (!code) continue;
    byCode.set(code, {
      code,
      discount: Number(promo.discount) || 0,
      discountType: promo.discountType === 'percentage' ? 'percentage' : 'fixed',
      isActive: promo.isActive !== false,
      createdAt: promo.createdAt || new Date(),
    });
  }

  for (const promo of incoming) {
    const prev = byCode.get(promo.code);
    byCode.set(promo.code, {
      code: promo.code,
      discount: promo.discount,
      discountType: promo.discountType,
      isActive: promo.isActive,
      createdAt: prev?.createdAt || new Date(),
    });
  }

  return Array.from(byCode.values());
}

/**
 * Apply one or more promo codes to multiple IP stock plans.
 * Existing promo codes with the same name are updated (upsert).
 */
export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    await connectDB();

    const body = await request.json();
    const stockIds = Array.isArray(body?.stockIds) ? body.stockIds.map(String).filter(Boolean) : [];
    const rawPromos = Array.isArray(body?.promos) ? body.promos : [];

    if (stockIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Select at least one IP stock plan' }, { status: 400 });
    }
    if (rawPromos.length === 0) {
      return NextResponse.json({ success: false, error: 'Add at least one promo code' }, { status: 400 });
    }

    const promos = [];
    for (const raw of rawPromos) {
      const normalized = normalizePromoInput(raw);
      if (normalized.error) {
        return NextResponse.json({ success: false, error: normalized.error }, { status: 400 });
      }
      promos.push(normalized);
    }

    const uniqueCodes = new Set(promos.map((p) => p.code));
    if (uniqueCodes.size !== promos.length) {
      return NextResponse.json({ success: false, error: 'Duplicate promo codes in request' }, { status: 400 });
    }

    const stocks = await IPStock.find({ _id: { $in: stockIds } });
    if (stocks.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching IP stock plans found' }, { status: 404 });
    }

    const updates = [];

    for (const stock of stocks) {
      const before = Array.isArray(stock.promoCodes) ? stock.promoCodes : [];
      const after = mergePromoCodes(before, promos);
      stock.promoCodes = after;
      await stock.save();

      updates.push({
        stockId: String(stock._id),
        name: stock.name,
        promoCount: after.length,
        applied: promos.map((p) => ({
          code: p.code,
          discount: p.discount,
          discountType: p.discountType,
          action: before.some((b) => String(b.code).toUpperCase() === p.code) ? 'updated' : 'added',
        })),
      });
    }

    const missingIds = stockIds.filter(
      (id) => !stocks.some((s) => String(s._id) === id)
    );

    return NextResponse.json({
      success: true,
      message: `Applied ${promos.length} promo(s) to ${stocks.length} plan(s)`,
      updatedCount: stocks.length,
      promoCodes: promos.map((p) => p.code),
      updates,
      missingIds,
    });
  } catch (error) {
    console.error('[BULK-PROMOS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to apply bulk promos' },
      { status: 500 }
    );
  }
}
