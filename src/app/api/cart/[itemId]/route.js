import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Cart from '@/models/cartModel';
import { priceCart, priceCartLine } from '@/lib/cartPricing';

function authError(err) {
  return NextResponse.json(
    { success: false, message: err?.message || 'Unauthorized' },
    { status: 401 }
  );
}

async function getCart(userId) {
  return Cart.findOne({ user: userId });
}

async function buildCartResponse(cart) {
  const priced = await priceCart(cart.items);
  const items = cart.items.map((item, idx) => {
    const line = priced.lines[idx];
    return {
      _id: item._id,
      kind: item.kind,
      ipStockId: item.ipStockId,
      slotIpPackageId: item.slotIpPackageId,
      memory: item.memory,
      os: item.os,
      quantity: item.quantity,
      promoCode: item.promoCode,
      addedAt: item.addedAt,
      pricing: line.priced.valid
        ? {
            valid: true,
            productName: line.priced.productName,
            unitOriginalPrice: line.priced.unitOriginalPrice,
            unitDiscount: line.priced.unitDiscount,
            unitPrice: line.priced.unitPrice,
            lineSubtotal: line.priced.lineSubtotal,
            lineDiscount: line.priced.lineDiscount,
            lineTotal: line.priced.lineTotal,
            promoApplied: line.priced.promoApplied || null,
          }
        : { valid: false, reason: line.priced.reason },
    };
  });

  return {
    success: true,
    cart: {
      _id: cart._id,
      items,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      itemCount: items.reduce((acc, it) => acc + (it.pricing.valid ? it.quantity : 0), 0),
      hasInvalidItems: priced.hasInvalidItems,
      updatedAt: cart.updatedAt,
    },
  };
}

/**
 * PATCH /api/cart/[itemId]
 * Body: optional { quantity?, promoCode?, os?, memory? }
 *
 * Validates the new state of the line (so a memory change against an
 * IPStock without that option fails fast) before persisting.
 */
export async function PATCH(request, { params }) {
  await connectDB();
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return authError(err);
  }

  const { itemId } = await Promise.resolve(params);
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const cart = await getCart(userId);
  if (!cart) return NextResponse.json({ success: false, message: 'Cart not found' }, { status: 404 });

  const item = cart.items.id(itemId);
  if (!item) return NextResponse.json({ success: false, message: 'Item not found in cart' }, { status: 404 });

  if (typeof body.quantity !== 'undefined') {
    const q = Math.max(1, Math.min(10, Number(body.quantity)));
    item.quantity = q;
  }
  if (typeof body.promoCode !== 'undefined') {
    item.promoCode = String(body.promoCode || '').trim();
  }
  if (typeof body.os !== 'undefined' && body.os) {
    item.os = body.os;
  }
  if (typeof body.memory !== 'undefined' && body.memory && item.kind === 'ipstock') {
    item.memory = body.memory;
  }

  // Re-validate post-edit so we can reject a memory swap onto an option
  // that does not exist on the IPStock.
  const priced = await priceCartLine(item.toObject ? item.toObject() : item);
  if (!priced.valid) {
    return NextResponse.json({ success: false, message: priced.reason }, { status: 400 });
  }

  await cart.save();
  const payload = await buildCartResponse(cart);
  return NextResponse.json(payload);
}

export async function DELETE(request, { params }) {
  await connectDB();
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return authError(err);
  }

  const { itemId } = await Promise.resolve(params);
  const cart = await getCart(userId);
  if (!cart) return NextResponse.json({ success: false, message: 'Cart not found' }, { status: 404 });

  const item = cart.items.id(itemId);
  if (!item) return NextResponse.json({ success: false, message: 'Item not found in cart' }, { status: 404 });

  cart.items.pull(itemId);
  await cart.save();

  const payload = await buildCartResponse(cart);
  return NextResponse.json(payload);
}
