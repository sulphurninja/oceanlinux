import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { renewResellerOrder } from '@/lib/resellerRenewApi';
import { getDaysUntilExpiry } from '@/lib/expiryHelper';
import { renewalBlockMessage } from '@/lib/trialVpsOrder';

/** GET — renewal quote / eligibility */
export async function GET(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const order = await Order.findOne({ _id: params.orderId, resellerId: auth.reseller._id });
  if (!order) {
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  const renewBlock = await renewalBlockMessage(order);
  const renewalPrice = renewBlock ? 0 : Math.ceil(Number(order.price) || 0);
  const daysUntilExpiry = order.expiryDate ? getDaysUntilExpiry(order.expiryDate) : null;

  return NextResponse.json({
    success: true,
    orderId: params.orderId,
    eligible: renewBlock ? false : !!order.expiryDate,
    renewable: !renewBlock,
    renewalPrice,
    currency: auth.reseller.wallet?.currency || 'INR',
    expiryDate: order.expiryDate,
    daysUntilExpiry,
    message: renewBlock || 'POST to this endpoint to renew using reseller wallet',
  });
}

/** POST — renew order (wallet deduct + upstream renew) */
export async function POST(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const order = await Order.findOne({ _id: params.orderId, resellerId: auth.reseller._id });
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const result = await renewResellerOrder(auth.reseller, order, params.orderId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[RESELLER-RENEW]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
