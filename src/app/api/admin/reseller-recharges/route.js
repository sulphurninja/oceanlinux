import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { requireAdmin } from '@/lib/adminAuth';
import {
  getResellerRechargeSettings,
  setResellerRechargeSettings,
  updatePaytmCredentials,
  updateKwikUpiCredentials,
  updateVyaparCredentials,
  getAdminPaytmSettings,
} from '@/lib/resellerRechargeSettings';
import { createPaytmDynamicQr, getPaytmWebhookUrl } from '@/lib/paytmMerchant';
import { createKwikUpiPayment, getKwikUpiWebhookUrl } from '@/lib/kwikUpi';
import { createVyaparOrderWithUniqueAmount } from '@/lib/vyaparGateway';
import { getPlatformVyaparWebhookUrl } from '@/lib/paymentGateways';

export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 300);

    const query = { method: { $in: ['paytm_qr', 'kwikupi'] } };
    if (status !== 'all') query.status = status;

    const [requests, settings] = await Promise.all([
      ResellerRechargeRequest.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      getResellerRechargeSettings(),
    ]);

    const resellerIds = [...new Set(requests.map((r) => String(r.reseller)))];
    const resellers = await Reseller.find({ _id: { $in: resellerIds } })
      .select('businessName email')
      .lean();
    const resellerMap = Object.fromEntries(resellers.map((r) => [String(r._id), r]));

    const items = requests.map((r) => ({
      ...r,
      resellerInfo: resellerMap[String(r.reseller)] || null,
    }));

    return NextResponse.json({
      success: true,
      items,
      settings: getAdminPaytmSettings(settings),
      webhookUrl: getPaytmWebhookUrl(),
      kwikUpiWebhookUrl: getKwikUpiWebhookUrl(),
      vyaparWebhookUrl: getPlatformVyaparWebhookUrl(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  await connectDB();

  try {
    const adminUser = await requireAdmin(request);
    const body = await request.json();
    const action = body?.action;

    if (action === 'save_settings') {
      const current = await getResellerRechargeSettings();
      const incoming = body.settings || {};
      const settings = await setResellerRechargeSettings(
        {
          ...current,
          minAmount: incoming.minAmount ?? current.minAmount,
          maxAmount: incoming.maxAmount ?? current.maxAmount,
          provider: ['paytm', 'kwikupi'].includes(incoming.provider) ? incoming.provider : current.provider,
        },
        adminUser?._id
      );
      return NextResponse.json({
        success: true,
        settings: getAdminPaytmSettings(settings),
        webhookUrl: getPaytmWebhookUrl(),
        kwikUpiWebhookUrl: getKwikUpiWebhookUrl(),
      });
    }

    if (action === 'connect_paytm') {
      const { mid, merchantKey, environment, posId, displayName } = body;
      if (!mid || !merchantKey) {
        return NextResponse.json({ success: false, message: 'MID and Merchant Key are required' }, { status: 400 });
      }

      const settings = await updatePaytmCredentials(
        {
          mid: String(mid).trim(),
          merchantKey: String(merchantKey).trim(),
          environment: environment === 'staging' ? 'staging' : 'production',
          posId: String(posId || 'OCEAN001').trim(),
          displayName: String(displayName || 'OceanLinux').trim(),
          connected: true,
          connectedAt: new Date().toISOString(),
        },
        adminUser?._id
      );

      return NextResponse.json({
        success: true,
        message: 'Paytm merchant connected',
        settings: getAdminPaytmSettings(settings),
        webhookUrl: getPaytmWebhookUrl(),
      });
    }

    if (action === 'connect_kwikupi') {
      const { apiKey, apiSecret, displayName } = body;
      if (!apiKey || !apiSecret) {
        return NextResponse.json({ success: false, message: 'API Key and API Secret are required' }, { status: 400 });
      }

      const settings = await updateKwikUpiCredentials(
        {
          apiKey: String(apiKey).trim(),
          apiSecret: String(apiSecret).trim(),
          displayName: String(displayName || 'OceanLinux').trim(),
          connected: true,
          connectedAt: new Date().toISOString(),
        },
        adminUser?._id
      );

      return NextResponse.json({
        success: true,
        message: 'KwikUPI connected — auto verify ON',
        settings: getAdminPaytmSettings(settings),
        kwikUpiWebhookUrl: getKwikUpiWebhookUrl(),
      });
    }

    if (action === 'connect_vyapar') {
      const { apiKey, webhookSecret, displayName } = body;
      if (!apiKey) {
        return NextResponse.json({ success: false, message: 'API Key is required' }, { status: 400 });
      }

      const settings = await updateVyaparCredentials(
        {
          apiKey: String(apiKey).trim(),
          webhookSecret: String(webhookSecret || '').trim(),
          displayName: displayName || 'OceanLinux',
          connected: true,
        },
        adminUser?._id || null
      );

      return NextResponse.json({
        success: true,
        message: 'VyaparGateway connected — UPI now verifies the settled amount',
        settings: getAdminPaytmSettings(settings),
        vyaparWebhookUrl: getPlatformVyaparWebhookUrl(),
      });
    }

    if (action === 'test_vyapar') {
      const settings = await getResellerRechargeSettings();
      if (!settings.vyapar.apiKey) {
        return NextResponse.json({ success: false, message: 'Save VyaparGateway credentials first' }, { status: 400 });
      }

      try {
        const test = await createVyaparOrderWithUniqueAmount({
          apiKey: settings.vyapar.apiKey,
          amount: 1,
          clientTxnId: `VGTEST_${Date.now()}`,
          customerName: 'Connection Test',
          customerEmail: 'test@oceanlinux.com',
          description: 'Connection test',
        });
        return NextResponse.json({
          success: true,
          message: `VyaparGateway OK — test order created for ₹${test.chargedAmount}. It will expire on its own; do not pay it.`,
        });
      } catch (err) {
        return NextResponse.json({ success: false, message: err.message }, { status: 400 });
      }
    }

    if (action === 'disconnect_vyapar') {
      const settings = await updateVyaparCredentials(
        {
          connected: false,
          apiKey: '',
          webhookSecret: '',
        },
        adminUser?._id || null
      );
      return NextResponse.json({
        success: true,
        message: 'VyaparGateway disconnected',
        settings: getAdminPaytmSettings(settings),
      });
    }

    if (action === 'test_paytm') {
      const settings = await getResellerRechargeSettings();
      const paytm = settings.paytm;
      if (!paytm.mid || !paytm.merchantKey) {
        return NextResponse.json({ success: false, message: 'Save Paytm credentials first' }, { status: 400 });
      }

      const testOrderId = `TEST_${Date.now()}`;
      await createPaytmDynamicQr({
        mid: paytm.mid,
        merchantKey: paytm.merchantKey,
        orderId: testOrderId,
        amount: 1,
        posId: paytm.posId,
        displayName: paytm.displayName,
        environment: paytm.environment === 'staging' ? 'staging' : 'production',
        comment: 'Connection test',
      });

      return NextResponse.json({
        success: true,
        message: 'Paytm connection OK — test QR created successfully',
      });
    }

    if (action === 'test_kwikupi') {
      const settings = await getResellerRechargeSettings();
      const kwikupi = settings.kwikupi;
      if (!kwikupi.apiKey || !kwikupi.apiSecret) {
        return NextResponse.json({ success: false, message: 'Save KwikUPI credentials first' }, { status: 400 });
      }

      const testOrderId = `TEST_${Date.now()}`;
      await createKwikUpiPayment({
        apiKey: kwikupi.apiKey,
        apiSecret: kwikupi.apiSecret,
        amount: settings.minAmount || 1,
        orderId: testOrderId,
        customerName: 'Connection Test',
      });

      return NextResponse.json({
        success: true,
        message: 'KwikUPI connection OK — test payment created',
      });
    }

    if (action === 'disconnect_paytm') {
      const settings = await updatePaytmCredentials(
        {
          connected: false,
          mid: '',
          merchantKey: '',
        },
        adminUser?._id
      );
      return NextResponse.json({
        success: true,
        message: 'Paytm disconnected',
        settings: getAdminPaytmSettings(settings),
      });
    }

    if (action === 'disconnect_kwikupi') {
      const settings = await updateKwikUpiCredentials(
        {
          connected: false,
          apiKey: '',
          apiSecret: '',
        },
        adminUser?._id
      );
      return NextResponse.json({
        success: true,
        message: 'KwikUPI disconnected',
        settings: getAdminPaytmSettings(settings),
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
