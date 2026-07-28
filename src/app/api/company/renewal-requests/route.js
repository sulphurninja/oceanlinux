import { NextResponse } from 'next/server';
import { resolveCompanySession } from '@/lib/companySession';
import connectDB from '@/lib/db';
import RenewalRequest from '@/models/renewalRequestModel';
import Order from '@/models/orderModel';
import Company from '@/models/companyModel';
import { calculateCompanyRenewalExpiryDate } from '@/lib/expiryHelper';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { toObjectIdString } from '@/lib/queryIds';
const { getAdvpsRebuildResetFields, isAdvpsOrder } = require('@/lib/advpsRebuildLimit');
const { notifyRenewalCompleted } = require('@/lib/renewalNotifications');
const { executeResellerPanelUpstreamRenewal } = require('@/lib/resellerPanelRenewal');
const { resolveRenewalExpiryFromPanel } = require('@/lib/companyResellerInventorySync');
const { resolveProviderFromOrder } = require('@/lib/orderAnnouncementTarget');
const { isKurohostOrder, executeKurohostRenewalOnApprove } = require('@/lib/kurohostRenewal');
const { canRenewHostheavenPanelOnCompanyApprove, isHostheavenDirectRenewEligible } = require('@/lib/companyRenewal');

/**
 * GET /api/company/renewal-requests?status=pending|approved|rejected
 * Returns the company's renewal queue. Defaults to `pending`.
 */
export async function GET(request) {
  const company = await resolveCompanySession();
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
  const company = await resolveCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { requestId, action, adminNotes, renewOnHostheavenPanel } = await request.json();

  const safeRequestId = toObjectIdString(requestId);
  if (!safeRequestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const renewalReq = await RenewalRequest.findOne({
    _id: safeRequestId,
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

  if (isSlotIpOrder(order)) {
    return NextResponse.json({ error: SLOT_IP_NO_RENEWAL_MESSAGE }, { status: 400 });
  }

  if (action === 'approve') {
    // Recompute expiry against the current value — the proposed expiry was
    // captured at payment time, but if the customer somehow bought another
    // renewal in between, we always extend from `order.expiryDate` (or now,
    // whichever is later). This matches the standard renewal semantics.
    const previousExpiry = order.expiryDate;
    let newExpiry = calculateCompanyRenewalExpiryDate(previousExpiry);

    let providerRenewalSuccess = true;
    let providerRenewalResult = null;
    let hostheavenPanelRenewAttempted = false;
    const provider = resolveProviderFromOrder(order);
    const companyDoc = await Company.findById(company.id).select('resellerApi name').lean();
    const panelRenewEligible =
      renewOnHostheavenPanel !== false &&
      (provider === 'reseller-api' ||
        (await isHostheavenDirectRenewEligible(order)) ||
        canRenewHostheavenPanelOnCompanyApprove(order, companyDoc));

    if (panelRenewEligible && !isKurohostOrder(order)) {
      hostheavenPanelRenewAttempted = true;
      const panelRenew = await executeResellerPanelUpstreamRenewal(order, {
        months: 1,
        Order,
        companyId: company.id,
      });
      providerRenewalSuccess = panelRenew.success;
      providerRenewalResult = panelRenew.result || { error: panelRenew.error };
      newExpiry = await resolveRenewalExpiryFromPanel(order, newExpiry, { panelRenew });
      if (!panelRenew.success) {
        console.warn('[COMPANY-RENEWAL] Hostheaven panel renew on approve failed:', panelRenew.error);
      }
    } else if (isKurohostOrder(order)) {
      const kuroRenew = await executeKurohostRenewalOnApprove(order, { Order });
      providerRenewalSuccess = kuroRenew.success;
      providerRenewalResult = kuroRenew;
      if (!kuroRenew.success && !kuroRenew.skipped) {
        console.warn('[COMPANY-RENEWAL] KuroHost post-approve action failed:', kuroRenew.message);
      }
    }

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
      providerRenewalSuccess: providerRenewalSuccess,
      providerRenewalResult: providerRenewalResult,
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
      ...(isAdvpsOrder(order) ? getAdvpsRebuildResetFields() : {}),
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

    notifyRenewalCompleted(order._id, newExpiry, renewalReq.renewalTxnId).catch((err) =>
      console.error('[COMPANY-RENEWAL] renewal notification failed:', err.message),
    );

    const approveMessage = isKurohostOrder(order)
      ? providerRenewalSuccess
        ? 'Renewal approved — site expiry extended and KuroHost VM started/synced.'
        : 'Renewal approved — site expiry extended. KuroHost action had issues; check providerRenewalResult.'
      : hostheavenPanelRenewAttempted
        ? providerRenewalSuccess
          ? 'Renewal approved — order extended and Hostheaven panel renewed.'
          : 'Renewal approved — order extended on OceanLinux. Hostheaven panel renew failed; extend manually on panel.'
        : 'Renewal approved — order has been extended.';

    return NextResponse.json({
      success: true,
      message: approveMessage,
      orderId: String(order._id),
      newExpiryDate: newExpiry,
      hostheavenPanelRenew: hostheavenPanelRenewAttempted
        ? { attempted: true, success: providerRenewalSuccess, result: providerRenewalResult }
        : undefined,
      kurohostRenewal: isKurohostOrder(order) ? providerRenewalResult : undefined,
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
