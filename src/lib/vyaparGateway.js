import crypto from 'crypto';

const VYAPAR_BASE_URL = 'https://vyapargateway.com/api/v1';

/**
 * VyaparGateway UPI client.
 *
 * Unlike KwikUPI, this gateway reconciles an incoming UPI credit against the
 * exact amount an order is waiting for. Underpaying an order leaves it pending
 * until it expires, which is what makes it immune to the "edit am= and pay ₹1"
 * attack. Two consequences shape this module:
 *
 *   1. Only one pending order per (merchant account, amount) is allowed, so
 *      concurrent orders of the same price need distinct paise — see
 *      createVyaparOrderWithUniqueAmount.
 *   2. Orders expire after roughly two minutes, so callers must be able to
 *      re-issue an order for the same transaction.
 */

/** Rounds to paise and avoids the float artefacts that break exact matching. */
export function toPaiseSafe(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

function isAmountCollisionError(message) {
  return /high volume|exact amount|slightly different amount/i.test(String(message || ''));
}

async function vyaparPost(path, body) {
  const res = await fetch(`${VYAPAR_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.status === false) {
    const message = data?.detail || data?.msg || data?.message || `VyaparGateway request failed (${res.status})`;
    const error = new Error(message);
    error.amountCollision = isAmountCollisionError(message);
    error.httpStatus = res.status;
    throw error;
  }

  return data;
}

/**
 * Create a single payment order at the exact amount given.
 */
export async function createVyaparOrder({
  apiKey,
  amount,
  clientTxnId,
  customerName,
  customerEmail,
  customerMobile,
  redirectUrl,
  description,
}) {
  if (!apiKey) throw new Error('VyaparGateway API key missing');

  const data = await vyaparPost('/create_order', {
    key: apiKey,
    amount: toPaiseSafe(amount),
    client_txn_id: clientTxnId,
    customer_name: customerName || 'Customer',
    customer_email: customerEmail || undefined,
    customer_mobile: customerMobile || undefined,
    redirect_url: redirectUrl || undefined,
    p_info: (description || 'Order').slice(0, 100),
  });

  const d = data?.data || {};
  if (!d.order_id) {
    throw new Error('VyaparGateway did not return an order id');
  }

  return {
    orderId: d.order_id,
    clientTxnId: d.client_txn_id || clientTxnId,
    amount: Number(d.amount),
    paymentUrl: d.payment_url || '',
    upiLink: d.upi_string || '',
    qrImageUrl: d.qr_code || '',
    upiIntent: d.upi_intent || null,
    expiresAt: d.expires_at || null,
    merchantUpiId: d.merchant_upi_id || '',
  };
}

/**
 * Create an order, nudging the paise upward when the gateway already has a
 * pending order for that exact amount.
 *
 * The customer is never charged less than they owe; at worst they pay up to 99
 * paise more, and the charged figure is returned so it can be stored as the
 * authoritative expected amount.
 */
export async function createVyaparOrderWithUniqueAmount(params) {
  const base = toPaiseSafe(params.amount);

  // Randomised so two servers racing on the same price don't walk the same
  // sequence and collide repeatedly.
  const offsets = [0, ...shuffledPaiseOffsets()];
  let lastError = null;

  for (let i = 0; i < Math.min(offsets.length, 12); i++) {
    const candidate = toPaiseSafe(base + offsets[i] / 100);
    try {
      const order = await createVyaparOrder({ ...params, amount: candidate });
      return { ...order, chargedAmount: candidate, baseAmount: base, surcharge: toPaiseSafe(candidate - base) };
    } catch (err) {
      lastError = err;
      if (!err.amountCollision) throw err;
    }
  }

  throw lastError || new Error('Could not allocate a unique payment amount');
}

function shuffledPaiseOffsets() {
  const offsets = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }
  return offsets;
}

/**
 * Poll an order. Returns verified only for a settled payment.
 */
export async function getVyaparOrderStatus({ apiKey, orderId, clientTxnId }) {
  if (!apiKey) throw new Error('VyaparGateway API key missing');
  if (!orderId && !clientTxnId) return { verified: false, reason: 'order id missing' };

  let data;
  try {
    data = await vyaparPost('/check_order_status', {
      key: apiKey,
      ...(orderId ? { order_id: orderId } : { client_txn_id: clientTxnId }),
    });
  } catch (err) {
    return { verified: false, reason: err.message, pending: true };
  }

  const d = data?.data || {};
  const status = String(d.status || '').toLowerCase();

  if (status === 'success') {
    return {
      verified: true,
      orderId: d.order_id || orderId,
      clientTxnId: d.client_txn_id || clientTxnId,
      amount: Number(d.amount),
      transactionId: d.upi_txn_id || d.order_id || '',
      expiresAt: d.expires_at || null,
      raw: stripQr(d),
    };
  }

  if (status === 'expired') {
    return { verified: false, reason: 'payment expired', expired: true, raw: stripQr(d) };
  }

  if (status === 'failed' || status === 'failure') {
    return { verified: false, reason: 'payment failed', failed: true, raw: stripQr(d) };
  }

  return { verified: false, reason: 'payment pending', pending: true, expiresAt: d.expires_at || null, raw: stripQr(d) };
}

/** The base64 QR blob is huge and useless in logs. */
function stripQr(data) {
  const { qr_code, upi_intent, ...rest } = data || {};
  return rest;
}

/**
 * Verify a webhook.
 *
 * The published guidance is an HMAC-SHA256 hex digest of the raw body under the
 * webhook secret, with a timestamp header to bound replays. Some deployments
 * bind the timestamp into the signed string, so both forms are accepted — each
 * still requires the secret — and the timestamp is always enforced.
 */
export function verifyVyaparWebhook({ rawBody, signature, timestamp, secret, maxSkewSeconds = 300 }) {
  if (!secret || !signature || !rawBody) return { valid: false, reason: 'missing signature material' };

  if (timestamp) {
    const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(skew) || skew > maxSkewSeconds) {
      return { valid: false, reason: 'timestamp outside allowed window' };
    }
  }

  const candidates = [rawBody];
  if (timestamp) {
    candidates.push(`${timestamp}.${rawBody}`, `${timestamp}${rawBody}`);
  }

  for (const signedString of candidates) {
    const expected = crypto.createHmac('sha256', secret).update(signedString, 'utf8').digest('hex');
    if (timingSafeEqualHex(expected, String(signature).trim())) {
      return { valid: true };
    }
  }

  return { valid: false, reason: 'signature mismatch' };
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function getVyaparWebhookSignature(headers) {
  return {
    signature: headers.get('x-vyapargateway-signature') || headers.get('x-oneupi-signature') || '',
    timestamp: headers.get('x-vyapargateway-timestamp') || headers.get('x-oneupi-timestamp') || '',
  };
}
