import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { orderToVm } from '@/lib/resellerPanelApi';
import { nonRenewablePackageMessage } from '@/lib/trialVpsOrder';
import {
  getResellerManagementCapabilities,
  listResellerOsTemplates,
  loadOrderIpStock,
} from '@/lib/resellerServerManage';

/** GET /api/v1/reseller/vms/{id} */
export async function GET(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const order = await Order.findOne({ _id: params.id, resellerId: auth.reseller._id });
    if (!order) {
      return NextResponse.json({ success: false, message: 'VM not found' }, { status: 404 });
    }

    const ipStock = await loadOrderIpStock(order);
    const management = getResellerManagementCapabilities(order, ipStock);
    const { _provider, ...publicManagement } = management;

    let osTemplates = [];
    if (management.available && management.supportedActions.includes('templates')) {
      osTemplates = await listResellerOsTemplates(order, ipStock).catch(() => []);
    }

    return NextResponse.json({
      success: true,
      vm: orderToVm(order),
      management: {
        ...publicManagement,
        osOptions: osTemplates.length ? osTemplates.map((t) => t.name) : publicManagement.osOptions,
        osTemplates,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/** PATCH /api/v1/reseller/vms/{id} — toggle autoRenew etc. */
export async function PATCH(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const order = await Order.findOne({ _id: params.id, resellerId: auth.reseller._id });
    if (!order) {
      return NextResponse.json({ success: false, message: 'VM not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const meta = { ...(order.apiMetadata || {}) };

    if (typeof body.autoRenew === 'boolean') {
      const renewBlock = nonRenewablePackageMessage(order);
      if (body.autoRenew && renewBlock) {
        return NextResponse.json({ success: false, message: renewBlock }, { status: 400 });
      }
      meta.autoRenew = body.autoRenew;
    }
    if (body.customerEmail) meta.endUserEmail = String(body.customerEmail).trim();

    order.apiMetadata = meta;
    await order.save();

    return NextResponse.json({
      success: true,
      message: 'VM updated',
      vm: orderToVm(order),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
