/**
 * KaroPay UPI (www.karopay.in).
 * Create: POST /service-api/v1/upi-gateway/qr/create
 * Status: GET  /service-api/v1/upi-gateway/qr/status
 *
 * Auth headers: x-api-key, x-api-secret.
 * Wallet credit only after status is PAID and the amount matches.
 */

const KAROPAY_ORIGIN = 'https://www.karopay.in';
const CREATE_ORDER_URL = `${KAROPAY_ORIGIN}/service-api/v1/upi-gateway/qr/create`;
const CHECK_STATUS_URL = `${KAROPAY_ORIGIN}/service-api/v1/upi-gateway/qr/status`;

export function getUpiGatewayWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://oceanlinux.com';
  return `${base.replace(/\/$/, '')}/api/reseller/wallet/recharge/upigateway-webhook`;
}

function istDate(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('day')}-${pick('month')}-${pick('year')}`;
}

export function upiGatewayTxnDate(date = new Date()) {
  return istDate(date instanceof Date ? date : new Date(date));
}

function authHeaders(apiKey, apiSecret) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'x-api-secret': apiSecret,
  };
}

function classifyStatus(rawStatus) {
  const status = String(rawStatus || '').toUpperCase();
  if (status === 'PAID' || status === 'SUCCESS') return 'success';
  if (status === 'FAILED' || status === 'EXPIRED' || status === 'CLOSED' || status === 'FAILURE') return 'failed';
  return 'pending';
}

async function extractUpiLink(paymentUrl) {
  if (!paymentUrl) return '';
  try {
    const res = await fetch(paymentUrl, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const match = html.match(/upi:\/\/pay\?[^"'\s<>\\]+/i);
    if (!match) return '';
    return match[0].replace(/&amp;/g, '&');
  } catch {
    return '';
  }
}

export async function createUpiGatewayOrder({
  apiKey,
  apiSecret,
  clientTxnId,
  amount,
  customerName,
  customerMobile,
}) {
  if (!apiKey || !apiSecret) throw new Error('KaroPay API key and secret are required');
  if (!clientTxnId) throw new Error('client_txn_id missing');

  const mobile = String(customerMobile || '').replace(/\D/g, '').slice(-10);
  const payload = {
    client_txn_id: String(clientTxnId).slice(0, 40),
    amount: String(Math.round(Number(amount))),
    customer_name: String(customerName || 'Customer').slice(0, 40),
    udf1: String(clientTxnId).slice(0, 25),
  };
  if (mobile.length === 10) payload.customer_mobile = mobile;

  const res = await fetch(CREATE_ORDER_URL, {
    method: 'POST',
    headers: authHeaders(apiKey, apiSecret),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status !== true || !data?.data?.order_id) {
    throw new Error(data?.msg || data?.message || 'KaroPay could not create the order');
  }

  const row = data.data;
  const paymentUrl = row.payment_url || '';
  const upiLink = await extractUpiLink(paymentUrl);
  return {
    orderId: String(row.order_id),
    paymentUrl,
    upiLink,
  };
}

/**
 * Confirms a payment with KaroPay. txn_date is DD-MM-YYYY.
 * Tries the order date, then today and yesterday (IST).
 */
export async function getUpiGatewayOrderStatus({ apiKey, apiSecret, clientTxnId, txnDate, expectedAmount }) {
  if (!apiKey || !apiSecret) return { verified: false, reason: 'KaroPay API key missing' };
  if (!clientTxnId) return { verified: false, reason: 'client_txn_id missing' };

  const dates = [];
  if (txnDate) dates.push(upiGatewayTxnDate(txnDate));
  const today = upiGatewayTxnDate(new Date());
  if (!dates.includes(today)) dates.push(today);
  const yesterday = upiGatewayTxnDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (!dates.includes(yesterday)) dates.push(yesterday);

  let last = { verified: false, reason: 'payment pending', pending: true };

  for (const date of dates) {
    const url = new URL(CHECK_STATUS_URL);
    url.searchParams.set('client_txn_id', String(clientTxnId));
    url.searchParams.set('txn_date', date);

    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(apiKey, apiSecret),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.status !== true || !data?.data) {
      last = { verified: false, reason: data?.msg || data?.message || 'payment pending', pending: true };
      continue;
    }

    const row = data.data;
    if (String(row.client_txn_id || '') !== String(clientTxnId)) {
      return { verified: false, reason: 'transaction id mismatch', failed: true };
    }

    const kind = classifyStatus(row.status);
    if (kind === 'pending') {
      last = { verified: false, reason: 'payment pending', pending: true };
      continue;
    }
    if (kind === 'failed') {
      return { verified: false, reason: 'payment failed', failed: true };
    }

    const paidAmount = Number(row.amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return { verified: false, reason: 'gateway amount missing' };
    }
    if (expectedAmount != null && Math.abs(paidAmount - Number(expectedAmount)) > 1) {
      return { verified: false, reason: 'amount mismatch', failed: true };
    }

    return {
      verified: true,
      amount: paidAmount,
      transactionId: row.upi_txn_id || String(row.order_id || row.id || ''),
      orderId: String(row.order_id || row.id || ''),
      clientTxnId: String(row.client_txn_id),
    };
  }

  return last;
}
