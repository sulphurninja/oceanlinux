/**
 * HMAC proof on wallet credit/refund rows.
 *
 * Compass can plant matching balance + transactions, but cannot forge
 * metadata.proof without TOKEN_SECRET / WALLET_CREDIT_HMAC_SECRET from .env.
 */

const crypto = require('crypto');

function getHmacSecret() {
  return (
    process.env.WALLET_CREDIT_HMAC_SECRET ||
    process.env.TOKEN_SECRET ||
    process.env.CRON_SECRET ||
    ''
  );
}

function proofPayload({ userId, amount, txnId, type, source, reference }) {
  return [
    String(userId || ''),
    String(Math.round(Number(amount) * 100) / 100),
    String(txnId || ''),
    String(type || 'credit'),
    String(source || ''),
    String(reference || ''),
  ].join('|');
}

function signWalletCreditProof(fields) {
  const secret = getHmacSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(proofPayload(fields)).digest('hex');
}

function verifyWalletCreditProof(txn, userId) {
  const secret = getHmacSecret();
  if (!secret) return { ok: false, reason: 'hmac_secret_missing' };
  const expected = String(txn?.metadata?.proof || '').trim();
  if (!expected || expected.length < 32) return { ok: false, reason: 'proof_missing' };

  const source = String(txn?.metadata?.source || '');
  const computed = signWalletCreditProof({
    userId,
    amount: txn.amount,
    txnId: txn._id,
    type: txn.type,
    source,
    reference: txn.reference,
  });

  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(computed, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'proof_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'proof_invalid' };
  }
  return { ok: true, reason: 'hmac_ok' };
}

module.exports = {
  getHmacSecret,
  signWalletCreditProof,
  verifyWalletCreditProof,
};
