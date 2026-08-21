export function buildUpiPayUrl({ vpa, payeeName, amount, txnRef, note }) {
  const params = new URLSearchParams();
  params.set('pa', String(vpa || '').trim());
  if (payeeName) params.set('pn', String(payeeName).slice(0, 50));
  params.set('am', String(Number(amount).toFixed(2)));
  params.set('cu', 'INR');
  if (txnRef) params.set('tr', String(txnRef).slice(0, 35));
  if (note) params.set('tn', String(note).slice(0, 80));
  return `upi://pay?${params.toString()}`;
}

export function buildQrImageUrl(payload, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

export function normalizeUtr(utr) {
  return String(utr || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function isValidUtr(utr) {
  const v = normalizeUtr(utr);
  return /^[A-Z0-9]{8,22}$/.test(v);
}
