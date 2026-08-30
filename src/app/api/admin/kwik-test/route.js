import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';
import { getVyaparCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { createVyaparOrderWithUniqueAmount, getVyaparOrderStatus } from '@/lib/vyaparGateway';
import { UPI_PROVIDER_VYAPAR } from '@/lib/paymentGateways';
import { logKwikRaw } from '@/lib/kwikRawLog';
import KwikRawLog from '@/models/kwikRawLogModel';

export const dynamic = 'force-dynamic';

const TEST_ORDER_PREFIX = 'VGTEST_';

/**
 * VyaparGateway partial-payment diagnostics.
 *
 * Creates a throwaway payment through the same API production uses, plus a
 * tampered QR that pays less than the requested amount. VyaparGateway should
 * leave the order pending/expired on underpay — never mark it success.
 */

async function vyaparCredentials() {
  return getVyaparCredentials(await getResellerRechargeSettings());
}

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

    const vyapar = await vyaparCredentials();
    if (!vyapar) {
      return NextResponse.json(
        { success: false, message: 'VyaparGateway is not connected. Connect it in Reseller Recharges first.' },
        { status: 400 }
      );
    }

    const testOrderId = `${TEST_ORDER_PREFIX}${Date.now()}`;
    const created = await createVyaparOrderWithUniqueAmount({
      apiKey: vyapar.apiKey,
      amount,
      clientTxnId: testOrderId,
      customerName: 'Vyapar Diagnostic',
      customerEmail: 'test@oceanlinux.com',
      description: 'Partial payment test',
    });

    const chargedAmount = created.chargedAmount;
    const upiLink = created.upiLink || '';
    let qrImageUrl = created.qrImageUrl || '';
    if (!qrImageUrl && upiLink) {
      qrImageUrl = await QRCode.toDataURL(upiLink, { width: 320, margin: 1 }).catch(() => '');
    }

    const tamperedUpiLink = tamperUpiAmount(upiLink, payAmount);
    let tamperedQrImageUrl = '';
    if (tamperedUpiLink) {
      tamperedQrImageUrl = await QRCode.toDataURL(tamperedUpiLink, { width: 320, margin: 1 }).catch(() => '');
    }

    await logKwikRaw({
      source: 'create',
      gateway: UPI_PROVIDER_VYAPAR,
      paymentId: created.orderId,
      orderId: testOrderId,
      expectedAmount: chargedAmount,
      raw: { paymentUrl: created.paymentUrl, upiLink, tamperedUpiLink, chargedAmount },
      note: `Vyapar diagnostic — honest ₹${chargedAmount}, tampered to ₹${payAmount}`,
    });

    return NextResponse.json({
      success: true,
      provider: UPI_PROVIDER_VYAPAR,
      testOrderId,
      paymentId: created.orderId,
      requestedAmount: amount,
      chargedAmount,
      payAmount,
      paymentPage: created.paymentUrl,
      expiresAt: created.expiresAt,
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
    const clientTxnId = searchParams.get('clientTxnId') || '';

    let statusProbe = null;
    if (paymentId || clientTxnId) {
      const vyapar = await vyaparCredentials();
      if (vyapar) {
        const result = await getVyaparOrderStatus({
          apiKey: vyapar.apiKey,
          orderId: paymentId || undefined,
          clientTxnId: clientTxnId || undefined,
        });
        statusProbe = {
          verified: !!result.verified,
          reason: result.reason || '',
          reportedAmount: result.amount ?? null,
          pending: !!result.pending,
          expired: !!result.expired,
          failed: !!result.failed,
          raw: result.raw ?? null,
        };
      }
    }

    const logFilter = paymentId
      ? { $or: [{ paymentId }, { orderId: clientTxnId || paymentId }] }
      : { orderId: new RegExp(`^${TEST_ORDER_PREFIX}`) };

    const logs = await KwikRawLog.find(logFilter).sort({ createdAt: -1 }).limit(50).lean();

    return NextResponse.json({ success: true, statusProbe, logs, externalLogs: [] });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
