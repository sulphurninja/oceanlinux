import crypto from 'crypto';

const KWIKUPI_BASE_URL = 'https://kwikupi.com/api';

/**
 * KwikUPI — create a payment (returns hosted payment page / QR).
 * Docs: https://kwikupi.com/docs
 */
export async function createKwikUpiPayment({ apiKey, apiSecret, amount, orderId, customerName, customerEmail, redirectUrl }) {
  if (!apiKey || !apiSecret) throw new Error('KwikUPI credentials missing');

  const res = await fetch(`${KWIKUPI_BASE_URL}/create-payment`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Number(amount),
      order_id: orderId,
      customer_name: customerName || undefined,
      customer_email: customerEmail || undefined,
      redirect_url: redirectUrl || undefined,
    }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `KwikUPI create failed (${res.status})`);
  }

  return {
    paymentId: data.payment_id || data.paymentId || '',
    paymentPage: data.payment_page || data.paymentPage || data.payment_url || '',
  };
}

/**
 * Check KwikUPI payment status by payment_id.
 */
export async function getKwikUpiPaymentStatus({ apiKey, apiSecret, paymentId }) {
  if (!apiKey || !apiSecret) throw new Error('KwikUPI credentials missing');
  if (!paymentId) return { verified: false, reason: 'payment id missing' };

  const res = await fetch(`${KWIKUPI_BASE_URL}/payment-status/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      'X-API-SECRET': apiSecret,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { verified: false, reason: data?.message || `status check failed (${res.status})`, pending: true };
  }

  const status = String(data.status || '').toUpperCase();
  if (status === 'TXN_SUCCESS' || status === 'SUCCESS' || status === 'PAID') {
    return {
      verified: true,
      orderId: data.order_id || '',
      amount: Number(data.amount) || 0,
      transactionId: data.transaction_id || data.txn_id || data.payment_id || '',
      paymentDetails: data,
    };
  }

  if (status === 'TXN_FAILURE' || status === 'FAILED' || status === 'FAILURE') {
    return { verified: false, reason: 'payment failed', failed: true };
  }

  return { verified: false, reason: 'payment pending', pending: true };
}

/**
 * Verify KwikUPI webhook signature (HMAC-SHA256 of raw body with apiSecret).
 */
export function verifyKwikUpiWebhook(rawBody, signatureHeader, apiSecret) {
  if (!apiSecret || !signatureHeader || !rawBody) return false;
  const expected = crypto.createHmac('sha256', apiSecret).update(rawBody, 'utf8').digest('hex');
  const sig = String(signatureHeader).trim();
  if (expected.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return expected === sig;
  }
}

export function getKwikUpiWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  return base ? `${base.replace(/\/$/, '')}/api/reseller/wallet/recharge/kwikupi-webhook` : '';
}

/**
 * KwikUPI payment page ke andar raw `upi://pay?...` link hota hai —
 * use nikaal ke direct UPI QR bana sakte hain (hosted page kholne ki zaroorat nahi).
 */
export async function fetchKwikUpiUpiLink(paymentPage) {
  if (!paymentPage) return '';
  try {
    const res = await fetch(paymentPage, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) return '';
    const html = await res.text();
    const m = html.match(/upi:\/\/pay\?[^"'\s<>\\]+/i);
    if (!m) return '';
    return m[0]
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } catch {
    return '';
  }
}
