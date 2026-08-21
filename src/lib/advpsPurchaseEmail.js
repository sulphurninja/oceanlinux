/**
 * ADVPS VPS purchase — always the buyer's Gmail/account email first.
 * If ADVPS rejects it (non-customer account), append 1, 2, 3… to that same address:
 *   buyer@gmail.com → buyer1@gmail.com → buyer2@gmail.com
 * Never uses a fixed OceanLinux/admin email.
 */

function orderIdToken(orderId) {
  return String(orderId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-12) || 'order';
}

function parseEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized.includes('@')) return null;
  const at = normalized.lastIndexOf('@');
  return {
    local: normalized.slice(0, at),
    domain: normalized.slice(at + 1),
    full: normalized,
  };
}

function buildAdvpsPurchaseEmail(orderId, userEmail) {
  const parsed = parseEmail(userEmail);
  if (!parsed) {
    const domain = (process.env.ADVPS_PURCHASE_EMAIL_DOMAIN || 'orders.oceanlinux.com').trim();
    return `ol-${orderIdToken(orderId)}@${domain}`;
  }
  return parsed.full;
}

/** Real email first, then local+1, local+2, … (ADVPS_PURCHASE_EMAIL_ATTEMPTS, default 6). */
function buildAdvpsPurchaseEmailCandidates(orderId, userEmail) {
  const parsed = parseEmail(userEmail);
  if (!parsed) {
    const domain = (process.env.ADVPS_PURCHASE_EMAIL_DOMAIN || 'orders.oceanlinux.com').trim();
    return [`ol-${orderIdToken(orderId)}@${domain}`];
  }

  const maxAttempts = Math.min(
    Math.max(parseInt(process.env.ADVPS_PURCHASE_EMAIL_ATTEMPTS || '6', 10), 2),
    20
  );
  const candidates = [parsed.full];
  for (let n = 1; n < maxAttempts; n += 1) {
    candidates.push(`${parsed.local}${n}@${parsed.domain}`);
  }
  return candidates;
}

function isAdvpsEmailPurchaseError(err) {
  const msg = String(err?.message || err).toLowerCase();
  return (
    /non-customer account/i.test(msg) ||
    /email/i.test(msg) ||
    /already exists/i.test(msg) ||
    /invalid.*mail/i.test(msg)
  );
}

module.exports = {
  buildAdvpsPurchaseEmail,
  buildAdvpsPurchaseEmailCandidates,
  isAdvpsEmailPurchaseError,
};
