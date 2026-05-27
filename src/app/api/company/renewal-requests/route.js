import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import RenewalRequest from '@/models/renewalRequestModel';
import Order from '@/models/orderModel';
import { calculateRenewalExpiryDate } from '@/lib/expiryHelper';

async function getCompanySession() {
  const cookieStore = await cookies();
  const session = cookieStore.get('company_session')?.value;
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

/**
 * GET /api/company/renewal-requests?status=pending|approved|rejected
 * Returns the company's renewal queue. Defaults to `pending`.
 */
export async function GET(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const requests = await RenewalRequest.find({
    companyId: company.id,
    status,
  })
    .sort({ requestedAt: -1 })
    .lean();

  return NextResponse.json(requests);
}

/**
 * POST /api/company/renewal-requests
 * Body: { requestId, action: 'approve'|'reject', adminNotes? }
 *
 * Approve: extends `Order.expiryDate`, pushes a `renewalPayments[]` entry
 * (matching the existing schema), clears `pendingRenewal`, marks the
 * RenewalRequest as approved.
 *
 * Reject: marks the RenewalRequest as rejected and clears the order's
 * pendingRenewal so the customer can try again. Refunds are out of scope
 * here — operations team handles those manually via the gateway dashboard.
 */
export async function POST(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { requestId, action, adminNotes } = await request.json();

  if (!requestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const renewalReq = await RenewalRequest.findOne({
    _id: requestId,
    companyId: company.id,
    status: 'pending',
  });
  if (!renewalReq) {
    return NextResponse.json({ error: 'Request not found or already processed' }, { status: 404 });
  }

  const order = await Order.findById(renewalReq.orderId);
  if (!order) {
    return NextResponse.json({ error: 'Linked order no longer exists' }, { status: 404 });
  }

  if (action === 'approve') {
    // Recompute expiry against the current value — the proposed expiry was
    // captured at payment time, but if the customer somehow bought another
    // renewal in between, we always extend from `order.expiryDate` (or now,
    // whichever is later). This matches the standard renewal semantics.
    const previousExpiry = order.expiryDate;
    const newExpiry = calculateRenewalExpiryDate(previousExpiry);

    const renewalPayment = {
      paymentId: renewalReq.paymentId,
      amount: renewalReq.amount,
      paidAt: renewalReq.requestedAt,
      previousExpiry,
      newExpiry,
      renewalTxnId: renewalReq.renewalTxnId,
      provider: 'company',
      paymentMethod: renewalReq.paymentMethod,
      gatewayOrderId: renewalReq.gatewayOrderId,
      paymentDetails: renewalReq.paymentDetails,
      providerRenewalSuccess: true,
      processedViaCompanyApproval: true,
      approvedBy: { companyId: String(company.id), companyName: company.name || '' },
    };

    await Order.findByIdAndUpdate(order._id, {
      expiryDate: newExpiry,
      lastAction: 'renew',
      lastActionTime: new Date(),
      transactionId: renewalReq.paymentId || renewalReq.renewalTxnId,
      gatewayOrderId: renewalReq.gatewayOrderId,
      paymentMethod: renewalReq.paymentMethod,
      paymentDetails: renewalReq.paymentDetails,
      $push: { renewalPayments: renewalPayment },
      $unset: { pendingRenewal: 1 },
    });

    renewalReq.status = 'approved';
    renewalReq.processedAt = new Date();
    if (adminNotes) renewalReq.adminNotes = adminNotes;
    renewalReq.renewalSnapshot = {
      ...renewalReq.renewalSnapshot,
      proposedNewExpiry: newExpiry, // commit the actual extension
    };
    await renewalReq.save();

    return NextResponse.json({
      success: true,
      message: 'Renewal approved — order has been extended.',
      orderId: String(order._id),
      newExpiryDate: newExpiry,
    });
  }

  // ── reject ──
  renewalReq.status = 'rejected';
  renewalReq.processedAt = new Date();
  if (adminNotes) renewalReq.adminNotes = adminNotes;
  await renewalReq.save();

  // Clear the awaiting-approval marker so the customer's UI doesn't keep
  // showing "awaiting" indefinitely. The order stays at its old expiry.
  await Order.findByIdAndUpdate(order._id, {
    $unset: { pendingRenewal: 1 },
  });

  return NextResponse.json({
    success: true,
    message: 'Renewal rejected. Customer has been informed.',
    orderId: String(order._id),
  });
}
