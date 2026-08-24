import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import Reseller from '@/models/resellerModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { orderToVm } from '@/lib/resellerPanelApi';

/** POST /api/v1/reseller/vms/{id}/assign — assign/unassign white-label customer */
export async function POST(request, { params }) {
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

    if (body.unassign === true || body.customerId === null || body.customerId === '') {
      delete meta.panelCustomerId;
      if (body.clearEmail) delete meta.endUserEmail;
      order.apiMetadata = meta;
      await order.save();
      return NextResponse.json({
        success: true,
        message: 'Customer unassigned from VM',
        vm: orderToVm(order),
      });
    }

    const customerId = body.customerId || body.customer?.id;
    if (customerId) {
      const reseller = await Reseller.findById(auth.reseller._id).select('panelCustomers').lean();
      const exists = (reseller?.panelCustomers || []).some((c) => String(c._id) === String(customerId));
      if (!exists) {
        return NextResponse.json({ success: false, message: 'Customer not found' }, { status: 404 });
      }
      meta.panelCustomerId = String(customerId);
    }

    if (body.customerEmail || body.email) {
      meta.endUserEmail = String(body.customerEmail || body.email).trim();
    }

    order.apiMetadata = meta;
    await order.save();

    return NextResponse.json({
      success: true,
      message: 'VM assigned to customer',
      vm: orderToVm(order),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
