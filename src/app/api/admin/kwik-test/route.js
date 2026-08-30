import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';
import { createKwikUpiPayment, getKwikUpiPaymentStatus } from '@/lib/kwikUpi';
import { buildKwikUpiInlineQr } from '@/lib/kwikUpiQr';
import { getKwikUpiCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { logKwikRaw } from '@/lib/kwikRawLog';
import KwikRawLog from '@/models/kwikRawLogModel';

export const dynamic = 'force-dynamic';

/**
 * KwikUPI partial-payment diagnostics.
 *
 * Creates a throwaway KwikUPI payment that is not tied to any order, then records
 * every webhook and status-API payload for it. Paying less than the requested
 * amount shows whether KwikUPI reports the credited amount or just echoes back
 * the amount we asked for.
 */

async function credentials() {
  return getKwikUpiCredentials(await getResellerRechargeSettings());
}

/**
 * Rewrites the `am` parameter of a UPI intent link, reproducing exactly what a
 * customer does when they read the link off the network tab and lower the amount.
 * Everything else (payee VPA, transaction ref, note) is left byte-for-byte intact,
 * which is why KwikUPI still ties the payment back to the original order.
 */
function tamperUpiAmount(upiLink, payAmount) {
  if (!upiLink || !/[?&]am=/i.test(upiLink)) return '';
  return upiLink.replace(/([?&]am=)[^&]*/i, `$1${payAmount.toFixed(2)}`);
}

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const body = await request.json().catch(() => ({}));
    const amount = Math.max(2, Math.min(1000, Number(body?.amount) || 10));
    const payAmount = Math.max(1, Math.min(amount, Number(body?.payAmount) || 1));

    const kwikupi = await credentials();
    if (!kwikupi) {
      return NextResponse.json({ success: false, message: 'KwikUPI is not connected' }, { status: 400 });
    }

    const testOrderId = `KWIKTEST_${Date.now()}`;
    const created = await createKwikUpiPayment({
      apiKey: kwikupi.apiKey,
      apiSecret: kwikupi.apiSecret,
      amount,
      orderId: testOrderId,
      customerName: 'Kwik Diagnostic',
    });

    if (!created.paymentPage) {
      return NextResponse.json({ success: false, message: 'KwikUPI did not return a payment page' }, { status: 502 });
    }

    const { upiLink, qrImageUrl } = await buildKwikUpiInlineQr(created.paymentPage);

    const tamperedUpiLink = tamperUpiAmount(upiLink, payAmount);
    let tamperedQrImageUrl = '';
    if (tamperedUpiLink) {
      tamperedQrImageUrl = await QRCode.toDataURL(tamperedUpiLink, { width: 320, margin: 1 }).catch(() => '');
    }

    await logKwikRaw({
      source: 'create',
      paymentId: created.paymentId,
      orderId: testOrderId,
      expectedAmount: amount,
      raw: { paymentPage: created.paymentPage, upiLink, tamperedUpiLink },
      note: `Diagnostic payment created for ₹${amount}, tampered to ₹${payAmount}`,
    });

    return NextResponse.json({
      success: true,
      testOrderId,
      paymentId: created.paymentId,
      requestedAmount: amount,
      payAmount,
      paymentPage: created.paymentPage,
      upiLink,
      qrImageUrl,
      tamperedUpiLink,
      tamperedQrImageUrl,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId') || '';

    let statusProbe = null;
    if (paymentId) {
      const kwikupi = await credentials();
      if (kwikupi) {
        const result = await getKwikUpiPaymentStatus({
          apiKey: kwikupi.apiKey,
          apiSecret: kwikupi.apiSecret,
          paymentId,
        });
        statusProbe = {
          verified: !!result.verified,
          reason: result.reason || '',
          reportedAmount: result.amount ?? null,
          raw: result.raw ?? result.paymentDetails ?? null,
        };
      }
    }

    const query = paymentId ? { paymentId } : { orderId: /^KWIKTEST_/ };
    const [logs, externalLogs] = await Promise.all([
      KwikRawLog.find(query).sort({ createdAt: -1 }).limit(50).lean(),
      KwikRawLog.find({ source: 'external-webhook' }).sort({ createdAt: -1 }).limit(25).lean(),
    ]);

    return NextResponse.json({ success: true, statusProbe, logs, externalLogs });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
