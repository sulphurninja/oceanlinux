import { getRazorpayClient } from '@/lib/razorpayClient';
import { createKwikUpiPayment, getKwikUpiPaymentStatus } from '@/lib/kwikUpi';
import { buildKwikUpiInlineQr } from '@/lib/kwikUpiQr';
import {
  getKwikUpiCredentials,
  getVyaparCredentials,
  getResellerRechargeSettings,
} from '@/lib/resellerRechargeSettings';
import { logKwikRaw } from '@/lib/kwikRawLog';
import {
  createVyaparOrderWithUniqueAmount,
  getVyaparOrderStatus,
  toPaiseSafe,
} from '@/lib/vyaparGateway';

/**
 * Shared gateway-order plumbing:
 *   - Wallet recharge, cart checkout, renewals, buy-now
 *
 * Payment methods: razorpay | upi
 *
 * UPI runs on VyaparGateway when it is connected, because it reconciles the
 * amount that actually settled and therefore rejects partial payments. KwikUPI
 * remains as a fallback for installs that have not switched yet, but it cannot
 * detect underpayment — it reports back whatever amount was requested.
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

async function getVyaparCreds() {
  const settings = await getResellerRechargeSettings();
  return getVyaparCredentials(settings);
}

export const UPI_PROVIDER_VYAPAR = 'vyapar';
export const UPI_PROVIDER_KWIKUPI = 'kwikupi';

/**
 * Older records predate the stored provider field. The two gateways mint
 * structurally different ids, so the provider can be recovered from the id
 * alone: KwikUPI uses a `pay_` prefix, VyaparGateway a bare 32-char hex string.
 */
export function inferUpiProvider(gatewayOrderId) {
  const id = String(gatewayOrderId || '');
  if (id.startsWith('pay_')) return UPI_PROVIDER_KWIKUPI;
  if (/^[a-f0-9]{32}$/i.test(id)) return UPI_PROVIDER_VYAPAR;
  return null;
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

  async function createVyaparUpiOrder(vyapar) {
    const result = await createVyaparOrderWithUniqueAmount({
      apiKey: vyapar.apiKey,
      amount,
      clientTxnId,
      customerName: customer.name,
      customerEmail: customer.email,
      customerMobile: customer.phone,
      redirectUrl: fullCallback,
      description,
    });

    return {
      method: 'upi',
      upiProvider: UPI_PROVIDER_VYAPAR,
      gatewayOrderId: result.orderId,
      // Collisions push the paise upward, so this — not the requested figure —
      // is what the customer must pay and what verification compares against.
      chargedAmount: result.chargedAmount,
      surcharge: result.surcharge,
      expiresAt: result.expiresAt,
      payload: {
        upi: {
          order_id: result.orderId,
          payment_id: result.orderId,
          payment_url: result.paymentUrl,
          qrImageUrl: result.qrImageUrl,
          amount: result.chargedAmount,
          expiresAt: result.expiresAt,
          provider: UPI_PROVIDER_VYAPAR,
          currency: 'INR',
        },
      },
    };
  }

  async function createKwikUpiOrder(kwikupi) {
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

    const { qrImageUrl } = await buildKwikUpiInlineQr(kwResult.paymentPage);

    return {
      method: 'upi',
      upiProvider: UPI_PROVIDER_KWIKUPI,
      gatewayOrderId: kwResult.paymentId,
      chargedAmount: Math.round(amount),
      payload: {
        upi: {
          order_id: kwResult.paymentId,
          payment_id: kwResult.paymentId,
          payment_url: kwResult.paymentPage,
          qrImageUrl,
          amount: Math.round(amount),
          provider: UPI_PROVIDER_KWIKUPI,
          currency: 'INR',
        },
      },
    };
  }

  async function createUpiOrder() {
    // Once VyaparGateway is configured it is the only UPI issuer. Falling back to
    // KwikUPI when Vyapar has a bad minute would silently reopen the partial
    // payment hole, so a failure here drops through to Razorpay instead.
    const vyapar = await getVyaparCreds();
    if (vyapar) return createVyaparUpiOrder(vyapar);

    const kwikupi = await getKwikUpiCreds();
    if (kwikupi) return createKwikUpiOrder(kwikupi);

    throw new Error('UPI payments are not configured. Contact support.');
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
      chargedAmount: toPaiseSafe(amount),
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
        `[Gateway] ${method === 'upi' ? 'UPI' : 'Razorpay'} failed${i === 0 ? `, trying ${fallback}` : ''}:`,
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
 * Verify a UPI payment against whichever gateway issued it.
 *
 * @param {string} clientTxnId — our own transaction id
 * @param {string} [gatewayOrderId] — provider order/payment id stored on the record
 * @param {string} [provider] — 'vyapar' | 'kwikupi'; inferred from the id when omitted
 */
export async function verifyUPIPayment(clientTxnId, gatewayOrderId, provider) {
  const paymentId = gatewayOrderId || clientTxnId;
  const resolved = provider || inferUpiProvider(paymentId);

  try {
    if (resolved !== UPI_PROVIDER_KWIKUPI) {
      const vyapar = await getVyaparCreds();
      if (vyapar) {
        return await verifyViaVyapar(vyapar, clientTxnId, paymentId);
      }
      // An unknown id with Vyapar disconnected falls through to KwikUPI so
      // orders created before the switch can still be settled.
    }

    const kwikupi = await getKwikUpiCreds();
    if (!kwikupi) {
      return { verified: false, error: 'UPI not configured' };
    }
    return await verifyViaKwikUpi(kwikupi, clientTxnId, paymentId);
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

async function verifyViaVyapar(vyapar, clientTxnId, orderId) {
  const result = await getVyaparOrderStatus({
    apiKey: vyapar.apiKey,
    orderId,
    clientTxnId,
  });

  if (!result.verified) {
    return {
      verified: false,
      error: result.reason || 'not paid',
      pending: result.pending,
      failed: result.failed,
      expired: result.expired,
      expiresAt: result.expiresAt,
      provider: UPI_PROVIDER_VYAPAR,
      raw: result.raw,
    };
  }

  return {
    verified: true,
    amount: result.amount,
    upi_txn_id: result.transactionId || orderId,
    order_id: result.clientTxnId || clientTxnId,
    provider: UPI_PROVIDER_VYAPAR,
    raw: result.raw,
  };
}

async function verifyViaKwikUpi(kwikupi, clientTxnId, paymentId) {
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
      provider: UPI_PROVIDER_KWIKUPI,
      raw: result.raw,
    };
  }

  // Only successful lookups are stored: pending polls repeat every few seconds
  // and would flood the collection without adding any diagnostic value.
  logKwikRaw({
    source: 'status-api',
    paymentId,
    orderId: result.orderId || clientTxnId,
    reportedStatus: result.raw?.status || 'SUCCESS',
    reportedAmount: result.amount,
    raw: result.raw,
  }).catch(() => {});

  return {
    verified: true,
    amount: result.amount,
    upi_txn_id: result.transactionId || paymentId,
    order_id: result.orderId || clientTxnId,
    provider: UPI_PROVIDER_KWIKUPI,
    raw: result.raw,
  };
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

export function getPlatformVyaparWebhookUrl() {
  const base = getReturnUrl();
  return `${base}/api/payment/vyapar-webhook`;
}
