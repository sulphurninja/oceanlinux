import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { sanitizePanelCustomer } from '@/lib/resellerPanelApi';

/** GET /api/v1/reseller/customers */
export async function GET(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const reseller = await Reseller.findById(auth.reseller._id).select('panelCustomers').lean();
  const customers = (reseller?.panelCustomers || []).map((c) =>
    sanitizePanelCustomer(c, auth.reseller._id),
  );

  return NextResponse.json({ success: true, count: customers.length, customers });
}

/** POST /api/v1/reseller/customers — create white-label customer */
export async function POST(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const displayName = String(body.displayName || body.name || email).trim();

    if (!email) {
      return NextResponse.json({ success: false, message: 'email is required' }, { status: 400 });
    }

    const reseller = await Reseller.findById(auth.reseller._id);
    if (!reseller) {
      return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
    }

    const dup = (reseller.panelCustomers || []).find((c) => String(c.email).toLowerCase() === email);
    if (dup) {
      return NextResponse.json(
        { success: false, message: 'Customer with this email already exists', customer: sanitizePanelCustomer(dup, reseller._id) },
        { status: 409 },
      );
    }

    reseller.panelCustomers = reseller.panelCustomers || [];
    reseller.panelCustomers.push({ email, displayName, createdAt: new Date(), updatedAt: new Date() });
    await reseller.save();

    const created = reseller.panelCustomers[reseller.panelCustomers.length - 1];

    return NextResponse.json(
      {
        success: true,
        message: body.password
          ? 'Customer created — they can log in with the provided password'
          : 'Customer created — set-password invite flow is handled by your panel branding',
        customer: sanitizePanelCustomer(created, reseller._id),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
