import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { renewResellerOrder } from '@/lib/resellerRenewApi';
import { getDaysUntilExpiry } from '@/lib/expiryHelper';
import { renewalBlockMessage } from '@/lib/trialVpsOrder';
import { buildRenewalQuote } from '@/lib/resellerPanelApi';

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
  const quote = buildRenewalQuote(order);
  const daysUntilExpiry = order.expiryDate ? getDaysUntilExpiry(order.expiryDate) : null;

  return NextResponse.json({
    success: true,
    orderId: params.orderId,
    ...quote,
    quote,
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
