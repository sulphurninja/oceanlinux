/**
 * UPI Gateway (merchant.upigateway.com, API api.ekqr.in).
 * Create: POST /api/create_order
 * Status: POST /api/check_order_status
 *
 * The API key goes in the JSON body. Wallet credit only after status is
 * success and the amount matches. The webhook body is not proof of payment.
 */

const CREATE_ORDER_URL = 'https://api.ekqr.in/api/create_order';
const CHECK_STATUS_URL = 'https://api.ekqr.in/api/check_order_status';
const MERCHANT_CHECK_STATUS_URL = 'https://merchant.upigateway.com/api/check_order_status';

function appBase() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://oceanlinux.com';
  return base.replace(/\/$/, '');
}

export function getUpiGatewayWebhookUrl() {
  return `${appBase()}/api/reseller/wallet/recharge/upigateway-webhook`;
}

export function getUpiGatewayRedirectUrl(clientTxnId, type) {
  const url = new URL(`${appBase()}/payment/callback`);
  if (type) url.searchParams.set('type', type);
  if (clientTxnId) url.searchParams.set('client_txn_id', String(clientTxnId));
  return url.toString();
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

function classifyStatus(rawStatus) {
  const status = String(rawStatus || '').toLowerCase();
  if (status === 'success' || status === 'paid') return 'success';
  if (status === 'failure' || status === 'failed' || status === 'expired') return 'failed';
  return 'pending';
}

function verifiedFromStatusRow(row, clientTxnId, expectedAmount) {
  if (!row || String(row.client_txn_id || '') !== String(clientTxnId)) {
    return { verified: false, reason: 'transaction id mismatch', failed: true };
  }

  const kind = classifyStatus(row.status);
  if (kind === 'pending') {
    return { verified: false, reason: 'payment pending', pending: true };
  }
  if (kind === 'failed') {
    return { verified: false, reason: row.remark || 'payment failed', failed: true };
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
    transactionId: row.upi_txn_id || String(row.id || ''),
    orderId: String(row.id || ''),
    clientTxnId: String(row.client_txn_id),
  };
}

async function checkUpiGatewayViaMerchantPortal({ apiKey, clientTxnId, expectedAmount }) {
  try {
    const res = await fetch(MERCHANT_CHECK_STATUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: String(apiKey).trim(),
        client_txn_id: String(clientTxnId),
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.status !== true || !data?.data || !data.data.client_txn_id) {
      return { verified: false, reason: data?.msg || 'payment pending', pending: true };
    }
    return verifiedFromStatusRow(data.data, clientTxnId, expectedAmount);
  } catch {
    return { verified: false, reason: 'payment pending', pending: true };
  }
}

function upiLinkFrom(row) {
  const intent = row?.upi_intent || {};
  return intent.bhim_link || intent.gpay_link || intent.phonepe_link || intent.paytm_link || '';
}

export async function createUpiGatewayOrder({
  apiKey,
  clientTxnId,
  amount,
  customerName,
  customerEmail,
  customerMobile,
  redirectUrl,
  productInfo,
}) {
  if (!apiKey) throw new Error('UPI Gateway API key is required');
  if (!clientTxnId) throw new Error('client_txn_id missing');

  const mobile = String(customerMobile || '').replace(/\D/g, '').slice(-10);
  const email = String(customerEmail || '').trim();
  if (!email.includes('@')) throw new Error('Customer email is required');

  const payload = {
    key: String(apiKey).trim(),
    client_txn_id: String(clientTxnId).slice(0, 40),
    amount: String(Math.round(Number(amount))),
    p_info: String(productInfo || 'OceanLinux').slice(0, 50),
    customer_name: String(customerName || 'Customer').slice(0, 40),
    customer_email: email.slice(0, 80),
    customer_mobile: mobile.length === 10 ? mobile : '9999999999',
    redirect_url: redirectUrl || getUpiGatewayRedirectUrl(clientTxnId),
    udf1: String(clientTxnId).slice(0, 25),
  };

  const res = await fetch(CREATE_ORDER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status !== true || !data?.data?.order_id) {
    throw new Error(data?.msg || data?.message || 'UPI Gateway could not create the order');
  }

  const row = data.data;
  return {
    orderId: String(row.order_id),
    paymentUrl: row.payment_url || '',
    upiLink: upiLinkFrom(row),
  };
}

/**
 * Confirms a payment with ekQR. txn_date is DD-MM-YYYY.
 * Tries the order date, then today and yesterday (IST).
 */
export async function getUpiGatewayOrderStatus({ apiKey, clientTxnId, txnDate, expectedAmount }) {
  if (!apiKey) return { verified: false, reason: 'UPI Gateway API key missing' };
  if (!clientTxnId) return { verified: false, reason: 'client_txn_id missing' };

  const dates = [];
  if (txnDate) dates.push(upiGatewayTxnDate(txnDate));
  const today = upiGatewayTxnDate(new Date());
  if (!dates.includes(today)) dates.push(today);
  const yesterday = upiGatewayTxnDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (!dates.includes(yesterday)) dates.push(yesterday);

  let last = { verified: false, reason: 'payment pending', pending: true };

  for (const date of dates) {
    const res = await fetch(CHECK_STATUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: String(apiKey).trim(),
        client_txn_id: String(clientTxnId),
        txn_date: date,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.status !== true || !data?.data || !data.data.client_txn_id) {
      last = { verified: false, reason: data?.msg || 'payment pending', pending: true };
      continue;
    }

    const parsed = verifiedFromStatusRow(data.data, clientTxnId, expectedAmount);
    if (parsed.verified) return parsed;
    if (parsed.failed) return parsed;
    last = parsed.pending ? parsed : last;
  }

  const merchant = await checkUpiGatewayViaMerchantPortal({ apiKey, clientTxnId, expectedAmount });
  if (merchant.verified || merchant.failed) return merchant;

  return last;
}
