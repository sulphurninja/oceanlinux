import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { createResellerOrder } from '@/lib/resellerOrderApi';
import { normalizeVmCreateBody, orderToVm } from '@/lib/resellerPanelApi';

/** GET /api/v1/reseller/vms — list VMs (alias for orders) */
export async function GET(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const orders = await Order.find({ resellerId: auth.reseller._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    const vms = orders.map(orderToVm);

    return NextResponse.json({
      success: true,
      count: vms.length,
      vms,
      legacy: { ordersPath: '/orders' },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/** POST /api/v1/reseller/vms — deploy VM (alias for POST /orders) */
export async function POST(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = normalizeVmCreateBody(await request.json());
    const result = await createResellerOrder(auth.reseller, body);
    const payload = { ...result.body };
    if (payload.order) {
      payload.vm = orderToVm(payload.order);
      if (payload.order.id) payload.vm.id = payload.order.id;
    }
    return NextResponse.json(payload, { status: result.status });
  } catch (error) {
    console.error('[RESELLER-VMS] POST error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
