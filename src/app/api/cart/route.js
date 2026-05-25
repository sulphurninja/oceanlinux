import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Cart from '@/models/cartModel';
import { priceCart } from '@/lib/cartPricing';

function authError(err) {
  return NextResponse.json(
    { success: false, message: err?.message || 'Unauthorized' },
    { status: 401 }
  );
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (cart) return cart;
  try {
    cart = await Cart.create({ user: userId, items: [] });
  } catch (err) {
    if (err.code === 11000) {
      cart = await Cart.findOne({ user: userId });
      if (cart) return cart;
    }
    throw err;
  }
  return cart;
}

/**
 * Hydrates the cart with live prices/availability so the UI never has to
 * trust client-cached prices. The cart subdocs themselves are returned
 * verbatim so client-side IDs stay stable across reloads.
 */
async function buildCartResponse(cart) {
  const priced = await priceCart(cart.items);
  const items = cart.items.map((item, idx) => {
    const line = priced.lines[idx];
    const stockDoc = line?.priced?.stock;
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
            availableMemoryOptions: stockDoc?.memoryOptions
              ? Array.from(stockDoc.memoryOptions.keys?.() || Object.keys(stockDoc.memoryOptions))
              : undefined,
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

export async function GET(request) {
  await connectDB();
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return authError(err);
  }

  const cart = await getOrCreateCart(userId);
  const payload = await buildCartResponse(cart);
  return NextResponse.json(payload);
}

/**
 * POST /api/cart
 * Body:
 *   { kind: 'ipstock', ipStockId, memory, os?, quantity?, promoCode? }
 *   { kind: 'slotip',  slotIpPackageId, quantity?, promoCode? }
 *
 * If a matching line already exists (same kind + product + memory) we
 * increment its quantity instead of pushing a duplicate. Server validates
 * the product/option exists; bad payloads return 400 with a message the
 * UI can toast verbatim.
 */
export async function POST(request) {
  await connectDB();
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return authError(err);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const kind = body?.kind;
  if (kind !== 'ipstock' && kind !== 'slotip') {
    return NextResponse.json({ success: false, message: 'kind must be ipstock or slotip' }, { status: 400 });
  }

  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  const promoCode = (body.promoCode || '').trim();
  const os = body.os || 'Ubuntu 22';

  const candidate = {
    kind,
    ipStockId: kind === 'ipstock' ? body.ipStockId : undefined,
    slotIpPackageId: kind === 'slotip' ? body.slotIpPackageId : undefined,
    memory: kind === 'ipstock' ? (body.memory || '') : 'Slot IP',
    os,
    quantity,
    promoCode,
  };

  // Verify availability + memory option / package validity before persisting.
  const { priceCartLine } = await import('@/lib/cartPricing');
  const priced = await priceCartLine(candidate);
  if (!priced.valid) {
    return NextResponse.json({ success: false, message: priced.reason }, { status: 400 });
  }

  const cart = await getOrCreateCart(userId);

  const existing = cart.items.find((it) => {
    if (it.kind !== kind) return false;
    if (kind === 'ipstock') {
      return String(it.ipStockId) === String(candidate.ipStockId) && it.memory === candidate.memory;
    }
    return String(it.slotIpPackageId) === String(candidate.slotIpPackageId);
  });

  if (existing) {
    existing.quantity = Math.min(10, existing.quantity + quantity);
    if (promoCode) existing.promoCode = promoCode;
    if (os) existing.os = os;
  } else {
    cart.items.push(candidate);
  }
  await cart.save();

  const payload = await buildCartResponse(cart);
  return NextResponse.json(payload);
}

/**
 * DELETE /api/cart
 * Empties the cart. Use the [itemId] route to remove a single line.
 */
export async function DELETE(request) {
  await connectDB();
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return authError(err);
  }

  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();

  const payload = await buildCartResponse(cart);
  return NextResponse.json(payload);
}
