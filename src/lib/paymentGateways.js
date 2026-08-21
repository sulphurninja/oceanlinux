import { getRazorpayClient } from '@/lib/razorpayClient';
import { createKwikUpiPayment, getKwikUpiPaymentStatus } from '@/lib/kwikUpi';
import { buildKwikUpiInlineQr } from '@/lib/kwikUpiQr';
import { getKwikUpiCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';

/**
 * Shared gateway-order plumbing:
 *   - Wallet recharge, cart checkout, renewals, buy-now
 *
 * Payment methods: razorpay | upi (KwikUPI auto QR behind the scenes)
 * Cashfree removed — no longer used.
 */

function getReturnUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    'https://oceanlinux.com';
  return baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`;
}

async function getKwikUpiCreds() {
  const settings = await getResellerRechargeSettings();
  return getKwikUpiCredentials(settings);
}

/**
 * @param {object} args
 * @param {'razorpay'|'upi'} args.preferredMethod
 * @param {string} args.clientTxnId
 * @param {number} args.amount — INR rupees
 * @param {{ id: string, name: string, email: string, phone?: string }} args.customer
 * @param {string} args.callbackPath
 * @param {object} [args.notes]
 * @param {string} [args.description]
 */
export async function createGatewayOrder({
  preferredMethod = 'razorpay',
  clientTxnId,
  amount,
  customer,
  callbackPath = '/payment/callback',
  notifyPath = '/api/payment/kwikupi-webhook',
  notes = {},
  description = '',
}) {
  const returnUrl = getReturnUrl();
  const sep = callbackPath.includes('?') ? '&' : '?';
  const fullCallback = `${returnUrl}${callbackPath}${sep}client_txn_id=${encodeURIComponent(clientTxnId)}`;

  const primary = preferredMethod === 'upi' ? 'upi' : 'razorpay';
  const fallback = primary === 'upi' ? 'razorpay' : 'upi';
  const tryOrder = [primary, fallback];
  let lastError = null;

  async function createUpiOrder() {
    const kwikupi = await getKwikUpiCreds();
    if (!kwikupi) throw new Error('UPI payments are not configured. Contact support.');

    const kwResult = await createKwikUpiPayment({
      apiKey: kwikupi.apiKey,
      apiSecret: kwikupi.apiSecret,
      amount: Math.round(amount),
      orderId: clientTxnId,
      customerName: customer.name,
      customerEmail: customer.email,
      redirectUrl: fullCallback,
    });

    if (!kwResult.paymentPage) {
      throw new Error('Failed to create UPI payment');
    }

    const { upiLink, qrImageUrl } = await buildKwikUpiInlineQr(kwResult.paymentPage);

    return {
      method: 'upi',
      gatewayOrderId: kwResult.paymentId,
      payload: {
        upi: {
          order_id: kwResult.paymentId,
          payment_id: kwResult.paymentId,
          payment_url: kwResult.paymentPage,
          qrImageUrl,
          upiLink,
          amount: Math.round(amount),
          currency: 'INR',
        },
      },
    };
  }

  async function createRazorpayOrder() {
    const razorpay = getRazorpayClient();
    if (!razorpay) throw new Error('Razorpay credentials not configured');

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: clientTxnId,
      notes: Object.fromEntries(
        Object.entries({ ...notes, customer_email: customer.email }).map(([k, v]) => [
          k,
          String(v ?? '').replace(/[^\x20-\x7E]/g, '').trim(),
        ])
      ),
    });

    return {
      method: 'razorpay',
      gatewayOrderId: order.id,
      payload: {
        razorpay: {
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          key: process.env.RAZORPAY_KEY_ID,
        },
      },
    };
  }

  for (let i = 0; i < tryOrder.length; i++) {
    const method = tryOrder[i];
    try {
      const result = method === 'upi' ? await createUpiOrder() : await createRazorpayOrder();
      return {
        ...result,
        fallbackUsed: i > 0,
        originalMethod: preferredMethod,
      };
    } catch (err) {
      lastError = err;
      console.error(
        `[Gateway] ${method === 'upi' ? 'UPI (KwikUPI)' : 'Razorpay'} failed${i === 0 ? `, trying ${fallback}` : ''}:`,
        err.message
      );
    }
  }

  throw lastError || new Error('No payment gateway available');
}

export function verifyRazorpaySignature({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  expectedOrderId,
}) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }
  if (!expectedOrderId || String(razorpay_order_id) !== String(expectedOrderId)) {
    return false;
  }
  const crypto = require('crypto');
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(razorpay_signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify UPI payment via KwikUPI status API.
 * @param {string} clientTxnId — our order id (for logging)
 * @param {string} [kwikUpiPaymentId] — gatewayOrderId stored on the record
 */
export async function verifyUPIPayment(clientTxnId, kwikUpiPaymentId) {
  const paymentId = kwikUpiPaymentId || clientTxnId;
  const kwikupi = await getKwikUpiCreds();
  if (!kwikupi) {
    return { verified: false, error: 'UPI not configured' };
  }

  try {
    const result = await getKwikUpiPaymentStatus({
      apiKey: kwikupi.apiKey,
      apiSecret: kwikupi.apiSecret,
      paymentId,
    });

    if (!result.verified) {
      return {
        verified: false,
        error: result.reason || 'not paid',
        pending: result.pending,
        failed: result.failed,
      };
    }

    return {
      verified: true,
      amount: result.amount,
      upi_txn_id: result.transactionId || paymentId,
      order_id: result.orderId || clientTxnId,
    };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

/** @deprecated Cashfree removed — always returns not verified */
export async function verifyCashfreePayment() {
  return { verified: false, error: 'Cashfree is no longer supported' };
}

export function buildClientTxnId(prefix) {
  const stamp = Date.now();
  const rnd = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${stamp}_${rnd}`;
}

export function getPlatformKwikUpiWebhookUrl() {
  const base = getReturnUrl();
  return `${base}/api/payment/kwikupi-webhook`;
}
