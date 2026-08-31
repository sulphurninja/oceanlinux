import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { getVyaparCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { UPI_PROVIDER_VYAPAR } from '@/lib/paymentGateways';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';
import { refreshVyaparUpiForTxnId, findVyaparRefreshTarget } from '@/lib/refreshVyaparUpiOrder';

export const runtime = 'nodejs';

/**
 * Re-issue a UPI payment order whose QR has expired.
 *
 * VyaparGateway holds an order open for about two minutes, which is often less
 * than a customer needs to open their UPI app and authorise. Rather than making
 * them start checkout over, the pending record keeps its identity and only the
 * gateway order behind it is replaced.
 */
export async function POST(request) {
  await connectDB();

  const userId = await getDataFromToken(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const limited = enforcePaymentRateLimit(request, { max: 30 });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const txnId = String(body.clientTxnId || body.renewalTxnId || '').trim();
  if (!txnId) {
    return NextResponse.json({ success: false, message: 'Transaction id required' }, { status: 400 });
  }

  const settings = await getResellerRechargeSettings();
  const vyapar = getVyaparCredentials(settings);
  if (!vyapar) {
    return NextResponse.json(
      { success: false, message: 'UPI refresh is unavailable. Please retry checkout.' },
      { status: 400 }
    );
  }

  const target = await findVyaparRefreshTarget(txnId, userId);
  if (!target) {
    return NextResponse.json({ success: false, message: 'Payment not found' }, { status: 404 });
  }
  if (target.settled) {
    return NextResponse.json({ success: true, alreadyPaid: true });
  }
  if (!String(target.paymentMethod || '').includes('upi')) {
    return NextResponse.json(
      { success: false, message: 'This payment is not a UPI payment' },
      { status: 400 }
    );
  }
  if (target.baseAmount <= 0) {
    return NextResponse.json({ success: false, message: 'Nothing left to pay' }, { status: 400 });
  }

  const result = await refreshVyaparUpiForTxnId(txnId, { userId, force: true });
  if (!result.refreshed) {
    return NextResponse.json(
      { success: false, message: result.reason || 'Could not refresh QR' },
      { status: result.alreadyPaid ? 200 : 502 }
    );
  }

  return NextResponse.json({
    success: true,
    clientTxnId: txnId,
    upi: {
      order_id: result.gatewayOrderId,
      payment_id: result.gatewayOrderId,
      payment_url: result.paymentUrl,
      qrImageUrl: result.qrImageUrl,
      amount: result.amount,
      expiresAt: result.expiresAt,
      provider: UPI_PROVIDER_VYAPAR,
      currency: 'INR',
    },
  });
}
