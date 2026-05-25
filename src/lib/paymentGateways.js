import { Cashfree } from 'cashfree-pg';
import Razorpay from 'razorpay';

/**
 * Shared gateway-order plumbing used by:
 *   - Wallet recharge       (`/api/wallet/recharge/initiate`)
 *   - Cart checkout         (`/api/cart/checkout/initiate`)
 *
 * Mirrors EXACTLY the logic in `/api/payment/create/route.js`:
 *   - Same UPI → Cashfree → Razorpay fallback chain
 *   - Same payload shape, sanitization, return URL conventions
 *   - Same env vars, no new ones introduced
 *
 * Returns a structured result the caller can persist + hand to the
 * frontend SDK call.
 */

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX'
  ? Cashfree.Environment.SANDBOX
  : Cashfree.Environment.PRODUCTION;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const UPI_GATEWAY_URL = 'https://merchant.upigateway.com/api/create_order';

function getReturnUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
  return baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
}

function sanitizeForCashfree(str) {
  if (!str) return '';
  return String(str).replace(/[^\w\s\-\.,:]/g, '').trim();
}

/**
 * @param {object} args
 * @param {'razorpay'|'cashfree'|'upi'} args.preferredMethod
 * @param {string} args.clientTxnId           — also acts as gateway order_id for Cashfree
 * @param {number} args.amount                — INR rupees (will be converted to paise where needed)
 * @param {{ id: string, name: string, email: string, phone?: string }} args.customer
 * @param {string} args.callbackPath          — e.g. '/payment/callback' or
 *                                              '/payment/callback?type=wallet'.
 *                                              `client_txn_id=` will be appended.
 * @param {string} args.notifyPath            — e.g. '/api/payment/webhook'
 * @param {object} [args.notes]               — passed verbatim to Razorpay notes / Cashfree tags
 * @param {string} [args.description]         — order_note for Cashfree
 *
 * @returns {Promise<{ method: string, gatewayOrderId: string,
 *                     payload: object, fallbackUsed: boolean,
 *                     originalMethod: string }>}
 */
export async function createGatewayOrder({
  preferredMethod = 'razorpay',
  clientTxnId,
  amount,
  customer,
  callbackPath = '/payment/callback',
  notifyPath = '/api/payment/webhook',
  notes = {},
  description = '',
}) {
  const returnUrl = getReturnUrl();
  const sep = callbackPath.includes('?') ? '&' : '?';
  const fullCallback = `${returnUrl}${callbackPath}${sep}client_txn_id=${clientTxnId}`;
  const fullNotify = `${returnUrl}${notifyPath}`;

  let actualMethod = preferredMethod;
  let lastError = null;

  // ----- UPI Gateway -----
  if (actualMethod === 'upi') {
    try {
      const apiKey = process.env.UPI_GATEWAY_API_KEY;
      if (!apiKey) throw new Error('UPI Gateway API key not configured');

      const upiPayload = {
        key: apiKey,
        client_txn_id: clientTxnId,
        amount: String(amount),
        p_info: description || `Payment ${clientTxnId}`,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_mobile: customer.phone || '9999999999',
        redirect_url: fullCallback,
        udf1: notes?.product_name || '',
        udf2: notes?.memory || '',
        udf3: notes?.promo_code || '',
      };

      const resp = await fetch(UPI_GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upiPayload),
      });
      const data = await resp.json();
      if (!resp.ok || data.status === false) {
        throw new Error(data.msg || 'UPI Gateway order creation failed');
      }
      return {
        method: 'upi',
        gatewayOrderId: data.data.order_id,
        payload: {
          upi: {
            order_id: data.data.order_id,
            payment_url: data.data.payment_url,
            amount,
            currency: 'INR',
          },
        },
        fallbackUsed: false,
        originalMethod: preferredMethod,
      };
    } catch (err) {
      lastError = err;
      console.error('[Gateway] UPI failed, falling back to Cashfree:', err.message);
      actualMethod = 'cashfree';
    }
  }

  // ----- Cashfree -----
  if (actualMethod === 'cashfree') {
    try {
      const cashfreeRequest = {
        order_id: clientTxnId,
        order_amount: Math.round(amount * 100) / 100,
        order_currency: 'INR',
        customer_details: {
          customer_id: String(customer.id),
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone || '9999999999',
        },
        order_meta: {
          return_url: fullCallback,
          notify_url: fullNotify,
        },
        order_note: sanitizeForCashfree(description || `Payment ${clientTxnId}`),
        order_tags: Object.fromEntries(
          Object.entries(notes).map(([k, v]) => [k, sanitizeForCashfree(String(v ?? ''))])
        ),
      };

      const cashfreeOrder = await Cashfree.PGCreateOrder('2023-08-01', cashfreeRequest);
      return {
        method: 'cashfree',
        gatewayOrderId: clientTxnId,
        payload: {
          cashfree: {
            order_id: clientTxnId,
            payment_session_id: cashfreeOrder.data.payment_session_id,
            order_token: cashfreeOrder.data.payment_session_id,
            amount: Math.round(amount * 100) / 100,
            currency: 'INR',
          },
        },
        fallbackUsed: actualMethod !== preferredMethod,
        originalMethod: preferredMethod,
      };
    } catch (err) {
      lastError = err;
      console.error('[Gateway] Cashfree failed, falling back to Razorpay:', err.message);
      actualMethod = 'razorpay';
    }
  }

  // ----- Razorpay (final fallback) -----
  if (actualMethod === 'razorpay') {
    const razorpayOptions = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: clientTxnId,
      notes: Object.fromEntries(
        Object.entries({ ...notes, customer_email: customer.email })
          .map(([k, v]) => [k, String(v ?? '').replace(/[^\x20-\x7E]/g, '').trim()])
      ),
    };
    const order = await razorpay.orders.create(razorpayOptions);
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
      fallbackUsed: actualMethod !== preferredMethod,
      originalMethod: preferredMethod,
    };
  }

  throw lastError || new Error('No gateway available');
}

/**
 * Verifies a Razorpay payment signature. Mirrors the logic in
 * /api/payment/confirm/route.js so all confirmation paths share one impl.
 */
export function verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }
  // crypto is a node builtin; lazy-require so this file stays edge-safe at import.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return expected === razorpay_signature;
}

/**
 * Server-side check_order_status against UPI Gateway. Mirrors logic in
 * /api/payment/upi-webhook/route.js.
 */
export async function verifyUPIPayment(clientTxnId) {
  const apiKey = process.env.UPI_GATEWAY_API_KEY;
  if (!apiKey) {
    return { verified: false, error: 'UPI Gateway API key not configured' };
  }
  try {
    const resp = await fetch('https://merchant.upigateway.com/api/check_order_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey, client_txn_id: clientTxnId }),
    });
    const data = await resp.json();
    if (data.status === true && data.data?.status === 'success') {
      return {
        verified: true,
        amount: parseFloat(data.data.amount),
        upi_txn_id: data.data.upi_txn_id,
      };
    }
    return { verified: false, status: data.data?.status, error: data.msg };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

/**
 * Cashfree poll fallback. Used by both recharge confirm and cart confirm.
 */
export async function verifyCashfreePayment(clientTxnId) {
  try {
    const resp = await Cashfree.PGOrderFetchPayments('2023-08-01', clientTxnId);
    if (!resp.data || resp.data.length === 0) {
      return { verified: false, error: 'No payment found' };
    }
    const payment = resp.data[0];
    if (payment.payment_status !== 'SUCCESS') {
      return { verified: false, error: `Payment status: ${payment.payment_status}`, payment };
    }
    return { verified: true, payment };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

export function buildClientTxnId(prefix) {
  const stamp = Date.now();
  const rnd = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${stamp}_${rnd}`;
}
