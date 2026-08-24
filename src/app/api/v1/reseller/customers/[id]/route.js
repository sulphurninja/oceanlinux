import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import Reseller from '@/models/resellerModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { sanitizePanelCustomer } from '@/lib/resellerPanelApi';

function findCustomer(reseller, customerId) {
  const list = reseller.panelCustomers || [];
  return list.find((c) => String(c._id) === String(customerId)) || null;
}

/** GET /api/v1/reseller/customers/{id} */
export async function GET(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const reseller = await Reseller.findById(auth.reseller._id).select('panelCustomers').lean();
  const customer = findCustomer(reseller, params.id);
  if (!customer) {
    return NextResponse.json({ success: false, message: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    customer: sanitizePanelCustomer(customer, auth.reseller._id),
  });
}

/** PATCH /api/v1/reseller/customers/{id} — update display name */
export async function PATCH(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reseller = await Reseller.findById(auth.reseller._id);
    if (!reseller) {
      return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
    }

    const idx = (reseller.panelCustomers || []).findIndex((c) => String(c._id) === String(params.id));
    if (idx < 0) {
      return NextResponse.json({ success: false, message: 'Customer not found' }, { status: 404 });
    }

    if (body.displayName || body.name) {
      reseller.panelCustomers[idx].displayName = String(body.displayName || body.name).trim();
    }
    reseller.panelCustomers[idx].updatedAt = new Date();
    await reseller.save();

    return NextResponse.json({
      success: true,
      customer: sanitizePanelCustomer(reseller.panelCustomers[idx], reseller._id),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/** DELETE /api/v1/reseller/customers/{id} — unassign VMs, do not delete VMs */
export async function DELETE(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const reseller = await Reseller.findById(auth.reseller._id);
    if (!reseller) {
      return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
    }

    const idx = (reseller.panelCustomers || []).findIndex((c) => String(c._id) === String(params.id));
    if (idx < 0) {
      return NextResponse.json({ success: false, message: 'Customer not found' }, { status: 404 });
    }

    reseller.panelCustomers.splice(idx, 1);
    await reseller.save();

    await Order.updateMany(
      { resellerId: auth.reseller._id, 'apiMetadata.panelCustomerId': String(params.id) },
      { $unset: { 'apiMetadata.panelCustomerId': '' } },
    );

    return NextResponse.json({
      success: true,
      message: 'Customer removed — their VMs were unassigned, not deleted',
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
