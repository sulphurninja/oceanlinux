import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import Reseller from '@/models/resellerModel';
import ResellerRechargeRequest from '@/models/resellerRechargeRequestModel';
import { buildClientTxnId } from '@/lib/paymentGateways';
import {
  getResellerRechargeSettings,
  getPaytmCredentials,
  getKwikUpiCredentials,
  getUpiGatewayCredentials,
} from '@/lib/resellerRechargeSettings';
import { createPaytmDynamicQr } from '@/lib/paytmMerchant';
import { createKwikUpiPayment } from '@/lib/kwikUpi';
import { buildKwikUpiInlineQr } from '@/lib/kwikUpiQr';
import { createUpiGatewayOrder, getUpiGatewayRedirectUrl } from '@/lib/upiGateway';
import QRCode from 'qrcode';
import { enforcePaymentRateLimit } from '@/lib/rateLimit';

const REQUEST_TTL_HOURS = 24;

async function requireReseller(request) {
  const userId = await getDataFromToken(request);
  if (!userId) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };

  const user = await User.findById(userId);
  if (!user || user.userType !== 'reseller' || !user.resellerId) {
    return { error: NextResponse.json({ success: false, message: 'Reseller access required' }, { status: 403 }) };
  }

  const reseller = await Reseller.findById(user.resellerId).select('businessName email status wallet');
  if (!reseller) {
    return { error: NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 }) };
  }
  if (reseller.status !== 'active') {
    return { error: NextResponse.json({ success: false, message: 'Reseller account is not active' }, { status: 403 }) };
  }

  return { user, reseller };
}

function validateAmount(amount, settings) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < settings.minAmount || n > settings.maxAmount) {
    return {
      ok: false,
      message: `Amount must be between ₹${settings.minAmount} and ₹${settings.maxAmount}`,
    };
  }
  return { ok: true, amount: Math.round(n) };
}

/**
 * Create a reseller recharge request.
 * Provider: 'paytm' (Paytm dynamic QR) or 'kwikupi' (KwikUPI hosted page / QR).
 * Auto verify on payment — no admin approval.
 */
export async function POST(request) {
  const rateLimited = enforcePaymentRateLimit(request);
  if (rateLimited) return rateLimited;

  await connectDB();

  try {
    const auth = await requireReseller(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const settings = await getResellerRechargeSettings();

    const amountCheck = validateAmount(body?.amount, settings);
    if (!amountCheck.ok) {
      return NextResponse.json({ success: false, message: amountCheck.message }, { status: 400 });
    }
    const amount = amountCheck.amount;
    const clientTxnId = buildClientTxnId('RRC');
    const expiresAt = new Date(Date.now() + REQUEST_TTL_HOURS * 60 * 60 * 1000);

    // ---------- UPI Gateway (ekQR) ----------
    if (settings.provider === 'upigateway') {
      const gateway = getUpiGatewayCredentials(settings);
      if (!gateway) {
        return NextResponse.json(
          { success: false, message: 'UPI Gateway is not connected. Ask admin to add the API key first.' },
          { status: 400 }
        );
      }

      let created;
      try {
        created = await createUpiGatewayOrder({
          apiKey: gateway.apiKey,
          clientTxnId,
          amount,
          customerName: auth.reseller.businessName || auth.user.name,
          customerEmail: auth.user.email || auth.reseller.email,
          customerMobile: auth.user.phone,
          redirectUrl: getUpiGatewayRedirectUrl(clientTxnId, 'reseller-wallet'),
          productInfo: 'Reseller wallet recharge',
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err.message || 'Failed to create UPI payment' },
          { status: 500 }
        );
      }

      const qrSource = created.upiLink || created.paymentUrl;
      let qrImageUrl = '';
      if (qrSource) {
        qrImageUrl = await QRCode.toDataURL(qrSource, { width: 320, margin: 1 }).catch(() => '');
      }

      const reqDoc = await ResellerRechargeRequest.create({
        reseller: auth.reseller._id,
        user: auth.user._id,
        amount,
        method: 'upigateway',
        clientTxnId,
        status: 'pending_payment',
        payeeName: gateway.displayName,
        paymentUrl: created.paymentUrl,
        upiPayload: created.upiLink,
        qrImageUrl,
        gatewayOrderId: created.orderId,
        paymentMethod: 'upigateway',
        expiresAt,
      });

      return NextResponse.json({
        success: true,
        request: {
          _id: reqDoc._id,
          amount: reqDoc.amount,
          clientTxnId: reqDoc.clientTxnId,
          status: reqDoc.status,
          payeeName: reqDoc.payeeName,
          paymentUrl: reqDoc.paymentUrl,
          qrImageUrl: reqDoc.qrImageUrl,
          qrData: created.upiLink || '',
        },
      });
    }

    // ---------- KwikUPI provider (older recharges only) ----------
    if (settings.provider === 'kwikupi') {
      const kwikupi = getKwikUpiCredentials(settings);
      if (!kwikupi) {
        return NextResponse.json(
          { success: false, message: 'KwikUPI is not connected. Ask admin to connect KwikUPI first.' },
          { status: 400 }
        );
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
      const redirectUrl = appUrl
        ? `${appUrl}/payment/callback?type=reseller-wallet&client_txn_id=${encodeURIComponent(clientTxnId)}`
        : undefined;

      let kwResult;
      try {
        kwResult = await createKwikUpiPayment({
          apiKey: kwikupi.apiKey,
          apiSecret: kwikupi.apiSecret,
          amount,
          orderId: clientTxnId,
          customerName: auth.reseller.businessName || undefined,
          customerEmail: auth.reseller.email || undefined,
          redirectUrl,
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err.message || 'Failed to create KwikUPI payment' },
          { status: 500 }
        );
      }

      const { upiLink, qrImageUrl } = await buildKwikUpiInlineQr(kwResult.paymentPage);

      const reqDoc = await ResellerRechargeRequest.create({
        reseller: auth.reseller._id,
        user: auth.user._id,
        amount,
        method: 'kwikupi',
        clientTxnId,
        status: 'pending_payment',
        payeeName: kwikupi.displayName,
        paymentUrl: kwResult.paymentPage,
        upiPayload: upiLink,
        qrImageUrl,
        kwikUpiPaymentId: kwResult.paymentId,
        gatewayOrderId: kwResult.paymentId,
        paymentMethod: 'kwikupi',
        expiresAt,
      });

      return NextResponse.json({
        success: true,
        request: {
          _id: reqDoc._id,
          amount: reqDoc.amount,
          clientTxnId: reqDoc.clientTxnId,
          status: reqDoc.status,
          payeeName: reqDoc.payeeName,
          paymentUrl: reqDoc.paymentUrl,
          qrImageUrl: reqDoc.qrImageUrl,
          qrData: '',
        },
      });
    }

    // ---------- Paytm provider (default) ----------
    const paytm = getPaytmCredentials(settings);
    if (!paytm) {
      return NextResponse.json(
        { success: false, message: 'Payment provider is not connected. Ask admin to connect Paytm or KwikUPI first.' },
        { status: 400 }
      );
    }

    let qrResult;
    try {
      qrResult = await createPaytmDynamicQr({
        mid: paytm.mid,
        merchantKey: paytm.merchantKey,
        orderId: clientTxnId,
        amount,
        posId: paytm.posId,
        displayName: paytm.displayName,
        environment: paytm.environment,
        comment: `Reseller wallet ${clientTxnId}`,
      });
    } catch (err) {
      return NextResponse.json(
        { success: false, message: err.message || 'Failed to create Paytm QR' },
        { status: 500 }
      );
    }

    const reqDoc = await ResellerRechargeRequest.create({
      reseller: auth.reseller._id,
      user: auth.user._id,
      amount,
      method: 'paytm_qr',
      clientTxnId: qrResult.orderId,
      status: 'pending_payment',
      payeeName: paytm.displayName,
      upiPayload: qrResult.qrData,
      qrImageUrl: qrResult.qrImageDataUrl,
      paytmQrCodeId: qrResult.qrCodeId,
      paymentMethod: 'paytm',
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      request: {
        _id: reqDoc._id,
        amount: reqDoc.amount,
        clientTxnId: reqDoc.clientTxnId,
        status: reqDoc.status,
        payeeName: reqDoc.payeeName,
        qrImageUrl: reqDoc.qrImageUrl,
        qrData: qrResult.qrData,
        paymentUrl: '',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
