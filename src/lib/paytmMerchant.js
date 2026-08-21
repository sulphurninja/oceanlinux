import PaytmChecksum from 'paytmchecksum';

const URLS = {
  staging: {
    createQr: 'https://securestage.paytmpayments.com/paymentservices/qr/create',
    orderStatus: 'https://securestage.paytmpayments.com/v3/order/status',
  },
  production: {
    createQr: 'https://secure.paytmpayments.com/paymentservices/qr/create',
    orderStatus: 'https://secure.paytmpayments.com/v3/order/status',
  },
};

function resolveUrls(environment) {
  return environment === 'staging' ? URLS.staging : URLS.production;
}

function sanitizePaytmOrderId(raw) {
  return String(raw || '')
    .replace(/[^A-Za-z0-9@\-_.]/g, '')
    .slice(0, 50);
}

async function signedPost(url, body, merchantKey) {
  const bodyStr = JSON.stringify(body);
  const signature = await PaytmChecksum.generateSignature(bodyStr, merchantKey);
  const payload = {
    body,
    head: {
      version: 'v1',
      signature,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  return data;
}

/**
 * Create Paytm dynamic UPI QR for a fixed amount + order id.
 */
export async function createPaytmDynamicQr({
  mid,
  merchantKey,
  orderId,
  amount,
  posId = 'OCEAN001',
  displayName = 'OceanLinux',
  environment = 'production',
  comment = 'Reseller wallet recharge',
}) {
  if (!mid || !merchantKey) {
    throw new Error('Paytm merchant credentials missing');
  }

  const safeOrderId = sanitizePaytmOrderId(orderId);
  if (!safeOrderId) throw new Error('Invalid Paytm order id');

  const amountStr = Number(amount).toFixed(2);
  const body = {
    mid,
    orderId: safeOrderId,
    amount: amountStr,
    businessType: 'UPI_QR_CODE',
    posId: String(posId || 'OCEAN001').slice(0, 50),
    displayName: String(displayName || 'Merchant').slice(0, 50),
    comment,
    imageRequired: true,
  };

  const urls = resolveUrls(environment);
  const data = await signedPost(urls.createQr, body, merchantKey);
  const result = data?.body?.resultInfo;

  if (result?.resultStatus !== 'SUCCESS') {
    throw new Error(result?.resultMsg || 'Paytm QR creation failed');
  }

  const qrData = data?.body?.qrData || '';
  const imageBase64 = data?.body?.image || '';

  return {
    orderId: safeOrderId,
    amount: amountStr,
    qrCodeId: data?.body?.qrCodeId || '',
    qrData,
    qrImageDataUrl: imageBase64 ? `data:image/png;base64,${imageBase64}` : '',
  };
}

/**
 * Poll Paytm transaction status for an order id.
 */
export async function getPaytmTransactionStatus({
  mid,
  merchantKey,
  orderId,
  environment = 'production',
}) {
  if (!mid || !merchantKey) {
    return { verified: false, reason: 'Paytm not configured' };
  }

  const body = {
    mid,
    orderId: sanitizePaytmOrderId(orderId),
  };

  const urls = resolveUrls(environment);
  const data = await signedPost(urls.orderStatus, body, merchantKey);
  const result = data?.body?.resultInfo;
  const status = result?.resultStatus;

  if (status === 'TXN_SUCCESS') {
    return {
      verified: true,
      txnId: data?.body?.txnId || '',
      bankTxnId: data?.body?.bankTxnId || '',
      txnAmount: data?.body?.txnAmount || '',
      paymentMode: data?.body?.paymentMode || '',
      txnDate: data?.body?.txnDate || '',
      raw: data?.body,
    };
  }

  if (status === 'TXN_FAILURE') {
    return { verified: false, failed: true, reason: result?.resultMsg || 'Payment failed' };
  }

  return {
    verified: false,
    pending: true,
    reason: result?.resultMsg || status || 'Payment pending',
  };
}

export async function verifyPaytmWebhookChecksum(body, merchantKey, checksum) {
  if (!body || !merchantKey || !checksum) return false;
  try {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    return await PaytmChecksum.verifySignature(bodyStr, merchantKey, checksum);
  } catch {
    return false;
  }
}

export function getPaytmWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com';
  const normalized = base.startsWith('http') ? base : `https://${base}`;
  return `${normalized.replace(/\/$/, '')}/api/payment/paytm-reseller-webhook`;
}
