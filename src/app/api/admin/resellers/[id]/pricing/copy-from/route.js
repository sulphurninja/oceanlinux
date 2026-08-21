import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import { enforceAdmin } from '@/lib/apiSecurity';

function toCustomPriceMap(input) {
  const map = {};
  if (!input) return map;
  const entries =
    input instanceof Map
      ? input.entries()
      : Object.entries(typeof input.toObject === 'function' ? input.toObject() : input);
  for (const [key, value] of entries) {
    const n = Number(value);
    if (key && n > 0) map[String(key)] = Math.ceil(n);
  }
  return map;
}

/**
 * POST /api/admin/resellers/[id]/pricing/copy-from
 * Body: { sourceResellerId: string, merge?: boolean }
 * Copies customPrices from another reseller onto this one.
 */
export async function POST(request, { params }) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();
  const { id: targetId } = await params;

  try {
    const body = await request.json();
    const sourceId = String(body?.sourceResellerId || '').trim();
    const merge = body?.merge === true;

    if (!sourceId) {
      return NextResponse.json({ success: false, message: 'sourceResellerId is required' }, { status: 400 });
    }
    if (sourceId === String(targetId)) {
      return NextResponse.json({ success: false, message: 'Cannot copy rates from the same reseller' }, { status: 400 });
    }

    const [source, target] = await Promise.all([
      Reseller.findById(sourceId).select('businessName email pricing.customPrices'),
      Reseller.findById(targetId),
    ]);

    if (!source) {
      return NextResponse.json({ success: false, message: 'Source reseller not found' }, { status: 404 });
    }
    if (!target) {
      return NextResponse.json({ success: false, message: 'Target reseller not found' }, { status: 404 });
    }

    const sourcePrices = toCustomPriceMap(source.pricing?.customPrices);
    const keyCount = Object.keys(sourcePrices).length;
    if (!keyCount) {
      return NextResponse.json(
        { success: false, message: 'Source reseller has no custom prices to copy' },
        { status: 400 }
      );
    }

    if (!target.pricing) target.pricing = {};

    const existing = toCustomPriceMap(target.pricing.customPrices);
    const merged = merge ? { ...existing, ...sourcePrices } : { ...sourcePrices };

    target.pricing.customPrices = merged;
    target.markModified('pricing.customPrices');
    target.markModified('pricing');
    await target.save();

    const fresh = await Reseller.findById(targetId).select('pricing');
    const pricing = fresh.toObject({ flattenMaps: true }).pricing;

    return NextResponse.json({
      success: true,
      message: `Copied ${keyCount} custom rate(s) from ${source.businessName || source.email}`,
      copiedCount: keyCount,
      merge,
      source: { id: source._id, businessName: source.businessName, email: source.email },
      pricing,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
