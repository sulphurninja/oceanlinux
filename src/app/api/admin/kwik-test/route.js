import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';
import { getUpiGatewayCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { createUpiGatewayOrder, getUpiGatewayOrderStatus, getUpiGatewayRedirectUrl } from '@/lib/upiGateway';
import { UPI_PROVIDER_UPIGATEWAY } from '@/lib/paymentGateways';
import { logKwikRaw } from '@/lib/kwikRawLog';
import KwikRawLog from '@/models/kwikRawLogModel';

export const dynamic = 'force-dynamic';

const TEST_ORDER_PREFIX = 'UITEST_';

/**
 * UPI Gateway (ekQR) payment test for the Vyapar UPI Test admin page.
 * Creates a throwaway QR through the same API reseller recharge uses.
 * No wallet credit and no VPS order.
 */

function tamperUpiAmount(upiLink, payAmount) {
  if (!upiLink || !/[?&]am=/i.test(upiLink)) return '';
  return upiLink.replace(/([?&]am=)[^&]*/i, `$1${Number(payAmount).toFixed(2)}`);
}

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const body = await request.json().catch(() => ({}));
    const amount = Math.max(2, Math.min(1000, Number(body?.amount) || 10));
    const payAmount = Math.max(1, Math.min(amount, Number(body?.payAmount) || 1));

    const gateway = getUpiGatewayCredentials(await getResellerRechargeSettings());
    if (!gateway) {
      return NextResponse.json(
        { success: false, message: 'UPI Gateway is not connected. Add the API key on Reseller Recharges first.' },
        { status: 400 }
      );
    }

    const testOrderId = `${TEST_ORDER_PREFIX}${Date.now()}`;
    const created = await createUpiGatewayOrder({
      apiKey: gateway.apiKey,
      clientTxnId: testOrderId,
      amount,
      customerName: 'UPI Gateway Test',
      customerEmail: 'hello@oceanlinux.com',
      customerMobile: '9999999999',
      redirectUrl: getUpiGatewayRedirectUrl(testOrderId),
      productInfo: 'UPI test',
    });

    const upiLink = created.upiLink || '';
    const qrSource = upiLink || created.paymentUrl || '';
    const qrImageUrl = qrSource
      ? await QRCode.toDataURL(qrSource, { width: 320, margin: 1 }).catch(() => '')
      : '';

    const tamperedUpiLink = tamperUpiAmount(upiLink, payAmount);
    const tamperedQrImageUrl = tamperedUpiLink
      ? await QRCode.toDataURL(tamperedUpiLink, { width: 320, margin: 1 }).catch(() => '')
      : '';

    await logKwikRaw({
      source: 'create',
      gateway: UPI_PROVIDER_UPIGATEWAY,
      paymentId: created.orderId,
      orderId: testOrderId,
      expectedAmount: amount,
      raw: { paymentUrl: created.paymentUrl, hasUpiLink: !!upiLink },
      note: `UPI Gateway test — honest ₹${amount}, tampered to ₹${payAmount}. Does not credit a wallet.`,
    });

    return NextResponse.json({
      success: true,
      provider: UPI_PROVIDER_UPIGATEWAY,
      testOrderId,
      paymentId: created.orderId,
      requestedAmount: amount,
      chargedAmount: amount,
      payAmount,
      paymentPage: created.paymentUrl,
      expiresAt: null,
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
    if (clientTxnId) {
      const gateway = getUpiGatewayCredentials(await getResellerRechargeSettings());
      const createdLog = await KwikRawLog.findOne({ orderId: clientTxnId, source: 'create' })
        .sort({ createdAt: -1 })
        .lean();
      if (gateway) {
        const result = await getUpiGatewayOrderStatus({
          apiKey: gateway.apiKey,
          clientTxnId,
          txnDate: createdLog?.createdAt,
          expectedAmount: createdLog?.expectedAmount,
        });
        statusProbe = {
          verified: !!result.verified,
          reason: result.reason || '',
          reportedAmount: result.amount ?? null,
          pending: !!result.pending,
          expired: false,
          failed: !!result.failed,
          raw: null,
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
