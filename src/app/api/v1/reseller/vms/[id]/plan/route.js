import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { memoryOptionsToObject, calculateResellerPlanPrice } from '@/lib/resellerOrderApi';
import { getDaysUntilExpiry } from '@/lib/expiryHelper';

async function loadOwnedOrder(resellerId, vmId) {
  return Order.findOne({ _id: vmId, resellerId });
}

/** GET /api/v1/reseller/vms/{id}/plan — upgrade/downgrade options + quote */
export async function GET(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const order = await loadOwnedOrder(auth.reseller._id, params.id);
  if (!order) {
    return NextResponse.json({ success: false, message: 'VM not found' }, { status: 404 });
  }

  const stock = order.ipStockId ? await IPStock.findById(order.ipStockId) : null;
  const mo = memoryOptionsToObject(stock?.memoryOptions || {});
  const currentMemory = order.memory;
  const options = [];

  for (const [mem, details] of Object.entries(mo)) {
    if (!details?.price) continue;
    const basePrice = Number(details.price);
    const resellerPrice = calculateResellerPlanPrice(
      auth.reseller,
      String(stock._id),
      mem,
      basePrice,
    );
    options.push({
      memory: mem,
      basePrice,
      price: resellerPrice,
      current: mem === currentMemory,
      action: mem === currentMemory ? 'current' : basePrice > (mo[currentMemory]?.price || 0) ? 'upgrade' : 'downgrade',
    });
  }

  const renewalPrice = Math.ceil(Number(order.price) || 0);

  return NextResponse.json({
    success: true,
    vmId: params.id,
    currentMemory,
    planId: order.ipStockId ? String(order.ipStockId) : null,
    options,
    renewal: {
      eligible: !!order.expiryDate,
      price: renewalPrice,
      currency: auth.reseller.wallet?.currency || 'INR',
      expiryDate: order.expiryDate,
      daysUntilExpiry: order.expiryDate ? getDaysUntilExpiry(order.expiryDate) : null,
    },
    message: 'POST with { memory } to change plan. Upgrade charges prorated difference; downgrade does not refund.',
  });
}

/** POST /api/v1/reseller/vms/{id}/plan — plan change (contact support / use manage for now) */
export async function POST(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const order = await loadOwnedOrder(auth.reseller._id, params.id);
  if (!order) {
    return NextResponse.json({ success: false, message: 'VM not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const targetMemory = body.memory || body.memoryOption || body.plan;

  return NextResponse.json(
    {
      success: false,
      message:
        'In-panel plan upgrade/downgrade is not automated yet. Use POST /orders/manage for reinstall, or contact support for RAM tier changes.',
      vmId: params.id,
      requestedMemory: targetMemory || null,
      currentMemory: order.memory,
    },
    { status: 501 },
  );
}
