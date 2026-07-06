import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import IPStock from '../../../models/ipStockModel';
const SlotIPPackage = require('../../../models/slotIpPackageModel');
const { resolvePromoForPrice } = require('../../../lib/promoCode');

export async function POST(req) {
  try {
    const { promoCode, ipStockId, slotIpPackageId, productPrice } = await req.json();

    await connectDB();

    let promoCodes = [];
    let price = Number(productPrice) || 0;

    if (slotIpPackageId) {
      const slotPkg = await SlotIPPackage.findById(slotIpPackageId);
      if (!slotPkg) {
        return NextResponse.json({ valid: false, message: 'Package not found' }, { status: 404 });
      }
      promoCodes = slotPkg.promoCodes || [];
      if (!price) price = Number(slotPkg.price) || 0;
    } else {
      const ipStock = await IPStock.findById(ipStockId);
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
