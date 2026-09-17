import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import IPStock from '../../../models/ipStockModel';
const SlotIPPackage = require('../../../models/slotIpPackageModel');
const TrialVpsPackage = require('../../../models/trialVpsPackageModel');
const { resolvePromoForPrice } = require('../../../lib/promoCode');
import { enforceRateLimit } from '@/lib/rateLimit';
import { toObjectIdString } from '@/lib/queryIds';

export async function POST(req) {
  // Without a limit this endpoint lets anyone enumerate valid promo codes.
  const rateLimited = enforceRateLimit(req, {
    max: 20,
    windowMs: 5 * 60_000,
    scope: 'ip',
    message: 'Too many promo code attempts. Please wait a few minutes.',
  });
  if (rateLimited) return rateLimited;

  try {
    const { promoCode, ipStockId, slotIpPackageId, trialVpsPackageId, productPrice } = await req.json();

    await connectDB();

    let promoCodes = [];
    let price = Number(productPrice) || 0;

    if (slotIpPackageId) {
      const packageId = toObjectIdString(slotIpPackageId);
      if (!packageId) {
        return NextResponse.json({ valid: false, message: 'Package not found' }, { status: 404 });
      }
      const slotPkg = await SlotIPPackage.findById(packageId);
      if (!slotPkg) {
        return NextResponse.json({ valid: false, message: 'Package not found' }, { status: 404 });
      }
      promoCodes = slotPkg.promoCodes || [];
      if (!price) price = Number(slotPkg.price) || 0;
    } else if (trialVpsPackageId) {
      const packageId = toObjectIdString(trialVpsPackageId);
      if (!packageId) {
        return NextResponse.json({ valid: false, message: 'Package not found' }, { status: 404 });
      }
      const trialPkg = await TrialVpsPackage.findById(packageId);
      if (!trialPkg) {
        return NextResponse.json({ valid: false, message: 'Package not found' }, { status: 404 });
      }
      promoCodes = trialPkg.promoCodes || [];
      if (!price) price = Number(trialPkg.price) || 0;
    } else {
      const stockId = toObjectIdString(ipStockId);
      if (!stockId) {
        return NextResponse.json({ valid: false, message: 'IP Stock not found' }, { status: 404 });
      }
      const ipStock = await IPStock.findById(stockId);
      if (!ipStock) {
        return NextResponse.json({ valid: false, message: 'IP Stock not found' }, { status: 404 });
      }
      promoCodes = ipStock.promoCodes || [];
    }

    const result = resolvePromoForPrice({
      promoCodes,
      promoCode,
      originalPrice: price,
    });

    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        message: result.message || 'Invalid or inactive promo code',
      });
    }

    if (!result.promo) {
      return NextResponse.json({
        valid: false,
        message: 'Invalid or inactive promo code',
      });
    }

    return NextResponse.json({
      valid: true,
      discount: result.promo.discount,
      discountType: result.promo.discountType,
      discountAmount: result.discount,
      finalPrice: result.finalPrice,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        valid: false,
        message: 'Error validating promo code',
      },
      { status: 500 }
    );
  }
}
