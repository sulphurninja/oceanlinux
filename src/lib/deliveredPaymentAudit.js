/**
 * Daily check: delivered orders (have an IP) and where the money came from.
 * Razorpay live capture or a traced wallet/reseller debit = OK.
 * Anything else is a doubt — those IPs are the loss watchlist.
 */

const Order = require('@/models/orderModel').default;
const Wallet = require('@/models/walletModel').default;
const WalletRecharge = require('@/models/walletRechargeModel').default;
const { verifyOrderPaymentProof } = require('@/lib/orderPaymentStatus');
const { verifyWalletCreditProof } = require('@/lib/walletCreditProof');

const LIVE = ['confirmed', 'active', 'paid', 'completed'];
const IST = 'Asia/Kolkata';

const UNVERIFIED = new Set(['razorpay_api_error', 'razorpay_unconfigured', 'no_gateway_order_id', 'upi_gateway_api_error']);

function istDayKey(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: IST });
}

function todayKey() {
  return istDayKey(new Date());
}

function sourceLabel(reason) {
  const r = String(reason || '');
  if (r.startsWith('razorpay') || r.startsWith('hybrid_razorpay') || r === 'pay_id') return 'Razorpay';
  if (r.includes('wallet_debit') || r === 'hybrid_wallet_only_verified') return 'Wallet';
  if (r.startsWith('reseller')) return 'Reseller wallet';
  if (r.includes('upi')) return 'UPI';
  if (r === 'trial') return 'Trial';
  return r || 'Unknown';
}

function looksLikeObjectId(id) {
  return /^[a-f0-9]{24}$/i.test(String(id || ''));
}

function txnTime(t) {
  const at = t?.createdAt ? new Date(t.createdAt).getTime() : 0;
  return Number.isFinite(at) ? at : 0;
}

/**
 * Real money only: admin credit, refund, or a confirmed recharge.
 * integrity_reconcile is the system writing down a balance nobody paid for,
 * so it never funds a VPS — even when that row has an HMAC.
 */
function creditIsReal(t, userId, confirmedRechargeIds) {
  const src = String(t.metadata?.source || '');
  if (src === 'integrity_reconcile') return false;

  const ref = String(t.reference || '');
  if (src === 'admin_panel' || ref.startsWith('admin_')) return true;
  if (t.type === 'refund') return true;
  if (verifyWalletCreditProof(t, userId).ok) return true;

  const rechargeId = String(t.metadata?.rechargeId || (looksLikeObjectId(ref) ? ref : ''));
  return confirmedRechargeIds.has(rechargeId);
}

/** Cart checkout debits the wallet once on the session, not on each child order. */
async function cartWalletCovered(userId, order) {
  const pd = order.paymentDetails || {};
  if (pd.confirmedViaCheckout !== true) return false;
  const sessionId = String(pd.checkoutSessionId || '').trim();
  if (!looksLikeObjectId(sessionId)) return false;

  const CheckoutSession = require('@/models/checkoutSessionModel').default;
  const session = await CheckoutSession.findById(sessionId)
    .select('status walletAmount walletTxnId')
    .lean();
  if (!session || session.status !== 'confirmed') return false;
  if (!(Number(session.walletAmount) > 0) || !session.walletTxnId) return false;

  return walletDebitCovered(userId, {
    walletDeduction: {
      deducted: true,
      transactionId: session.walletTxnId,
      amount: session.walletAmount,
    },
    price: session.walletAmount,
    createdAt: order.createdAt,
  });
}

/** True when this order's wallet debit was covered by real credits already in the wallet. */
async function walletDebitCovered(userId, order) {
  if (!userId || !order?.walletDeduction?.deducted) return false;
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet) return false;

  const txns = [...(wallet.transactions || [])].sort((a, b) => {
    const d = txnTime(a) - txnTime(b);
    if (d) return d;
    return String(a._id || '').localeCompare(String(b._id || ''));
  });

  const rechargeIds = [];
  for (const t of txns) {
    if (!['credit', 'bonus', 'refund'].includes(t.type)) continue;
    const src = String(t.metadata?.source || '');
    if (src === 'integrity_reconcile') continue;
    const ref = String(t.reference || '');
    const rechargeId = String(t.metadata?.rechargeId || (looksLikeObjectId(ref) ? ref : ''));
    if (looksLikeObjectId(rechargeId)) rechargeIds.push(rechargeId);
  }

  const confirmedRechargeIds = new Set();
  if (rechargeIds.length) {
    const ids = [...new Set(rechargeIds)];
    const recs = await WalletRecharge.find({ _id: { $in: ids }, status: 'confirmed' }).select('_id').lean();
    for (const rec of recs) confirmedRechargeIds.add(String(rec._id));
  }

  const targetId = String(order.walletDeduction.transactionId || '').trim();
  const targetAmt = Number(order.walletDeduction.amount) || Number(order.price) || 0;
  let pool = 0;

  for (const t of txns) {
    const amt = Math.abs(Number(t.amount) || 0);
    if (['credit', 'bonus', 'refund'].includes(t.type)) {
      if (creditIsReal(t, userId, confirmedRechargeIds)) pool += amt;
      continue;
    }
    if (t.type !== 'debit') continue;

    const isThis =
      (targetId && String(t._id) === targetId) ||
      (!targetId &&
        targetAmt > 0 &&
        Math.abs(amt - targetAmt) < 1 &&
        order.createdAt &&
        Math.abs(txnTime(t) - new Date(order.createdAt).getTime()) < 5 * 60 * 1000);

    if (isThis) return pool + 1 >= (targetAmt || amt);
    pool = Math.max(0, pool - amt);
  }

  return false;
}

/**
 * Scan-only. Vyapar / Kwik UPI never has a Razorpay order_ id.
 * A confirmed gateway txn whose paid amount covers this line is a real payment.
 * Provision still refuses UPI metadata on its own.
 */
function upiGatewayPaid(order) {
  const pd = order.paymentDetails || {};
  const provider = String(pd.upiProvider || '').toLowerCase();
  if (provider !== 'vyapar' && provider !== 'kwikupi' && provider !== 'kwik') return false;

  const txn = String(pd.upi_txn_id || order.transactionId || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(txn)) return false;
  if (!pd.confirmedAt) return false;

  const paid = Number(pd.verifiedAmount) || Number(pd.gatewayAmount) || 0;
  const price = Number(order.price) || 0;
  if (price > 0 && paid + 2 < price) return false;

  return Boolean(
    pd.verified === true ||
    pd.webhook ||
    pd.kwikRaw ||
    pd.vyaparOrderId ||
    pd.confirmedViaCheckout
  );
}

/** Scan-only: Razorpay says paid, even when the receipt was overwritten by a renewal or cart line. */
async function razorpayCaptured(gatewayOrderId) {
  const id = String(gatewayOrderId || '').trim();
  if (!id.startsWith('order_')) return false;
  try {
    const { getRazorpayClient } = require('@/lib/razorpayClient');
    const razorpay = getRazorpayClient();
    if (!razorpay) return false;
    const rzpOrder = await razorpay.orders.fetch(id);
    if (rzpOrder?.status === 'paid') return true;
    if (rzpOrder?.status === 'attempted') {
      const payments = await razorpay.orders.fetchPayments(id);
      return (payments?.items || []).some((p) => p.status === 'captured');
    }
    return false;
  } catch {
    return false;
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]);
    }
  }
  const n = Math.min(Math.max(concurrency, 1), items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;

function parseDay(value, fallback) {
  const text = String(value || '');
  return DAY.test(text) ? text : fallback;
}

function daySpan(fromKey, toKey) {
  const from = new Date(`${fromKey}T00:00:00.000+05:30`).getTime();
  const to = new Date(`${toKey}T00:00:00.000+05:30`).getTime();
  return Math.round((to - from) / 86400000) + 1;
}

/**
 * @param {{ date?: string, from?: string, to?: string }} opts
 * YYYY-MM-DD in IST. `from`+`to` is inclusive. A single `date` still works.
 */
async function auditDeliveredPayments(opts = {}) {
  const today = todayKey();
  let fromKey = parseDay(opts.from || opts.date, today);
  let toKey = parseDay(opts.to || opts.from || opts.date, fromKey);
  if (fromKey > toKey) {
    const swap = fromKey;
    fromKey = toKey;
    toKey = swap;
  }
  const span = daySpan(fromKey, toKey);
  if (span > MAX_RANGE_DAYS) {
    const err = new Error(`Date range can be at most ${MAX_RANGE_DAYS} days`);
    err.status = 400;
    throw err;
  }

  const start = new Date(`${fromKey}T00:00:00.000+05:30`);
  const end = new Date(`${toKey}T23:59:59.999+05:30`);
  const inRange = (day) => Boolean(day) && day >= fromKey && day <= toKey;
  const rangeLabel = fromKey === toKey ? fromKey : `${fromKey} → ${toKey}`;

  const orders = await Order.find({
    $and: [
      {
        $or: [
          { createdAt: { $gte: start, $lte: end } },
          { 'paymentDetails.confirmedAt': { $gte: start, $lte: end } },
        ],
      },
      {
        $or: [
          { status: { $in: LIVE }, ipAddress: { $exists: true, $nin: [null, ''] } },
          // Fake buys are often cancelled and the IP wiped. Still show that day's loss.
          { status: 'cancelled' },
          { provisioningStatus: 'terminated' },
        ],
      },
    ],
  })
    .populate('user', 'name email')
    .select(
      'user productName memory price status provisioningStatus paymentMethod transactionId gatewayOrderId clientTxnId ipAddress createdAt paymentDetails walletDeduction resellerId renewalPayments parentTxnId checkoutSessionId'
    )
    .lean();

  const fresh = orders.filter((order) => {
    const createdDay = istDayKey(order.createdAt);
    if (inRange(createdDay)) return true;
    const confirmedAt = order.paymentDetails?.confirmedAt;
    const confirmedDay = confirmedAt ? istDayKey(confirmedAt) : null;
    const renewalInRange = (order.renewalPayments || []).some(
      (r) => r?.paidAt && inRange(istDayKey(r.paidAt))
    );
    // Older server renewed inside the range — IP was already delivered. Not a new loss.
    if (renewalInRange && !inRange(createdDay)) return false;
    return inRange(confirmedDay);
  });

  const rows = await mapPool(fresh, 4, async (order) => {
    const user = order.user && typeof order.user === 'object' ? order.user : null;
    const base = {
      orderId: String(order._id),
      ip: order.ipAddress || '',
      email: user?.email || '',
      name: user?.name || '',
      product: order.productName || '',
      price: Math.round(Number(order.price) || 0),
      method: order.paymentMethod || '',
      status: order.status,
      day: istDayKey(order.paymentDetails?.confirmedAt || order.createdAt),
      at: order.paymentDetails?.confirmedAt || order.createdAt,
    };

    const method = String(order.paymentMethod || '').toLowerCase();
    const price = Number(order.price) || 0;
    if (price <= 0 || method === 'trial' || method === 'free' || /trial/i.test(order.productName || '')) {
      return { ...base, verdict: 'ok', source: 'Trial', reason: 'trial' };
    }

    let proof;
    try {
      proof = await verifyOrderPaymentProof(order);
    } catch (err) {
      return { ...base, verdict: 'unverified', source: 'Check failed', reason: err.message };
    }

    const reason = proof?.reason || '';
    const gatewayOrderId = String(
      order.gatewayOrderId || order.paymentDetails?.razorpay_order_id || ''
    ).trim();
    const userId = order.user?._id || order.user;

    const customerWalletSpend =
      order.walletDeduction?.deducted === true &&
      method !== 'reseller_wallet' &&
      (method === 'wallet' || method.startsWith('wallet+'));

    if (customerWalletSpend) {
      const covered = await walletDebitCovered(userId, order);
      if (!covered) {
        if (method.startsWith('wallet+') && (await razorpayCaptured(gatewayOrderId))) {
          return { ...base, verdict: 'ok', source: 'Razorpay', reason: 'hybrid_razorpay_live_paid' };
        }
        return {
          ...base,
          verdict: 'doubt',
          source: 'Untraced',
          reason: 'wallet_spend_without_real_credit',
        };
      }
      if (proof?.ok || reason === 'untrusted_wallet_funding') {
        return { ...base, verdict: 'ok', source: 'Wallet', reason: 'wallet_known_funding' };
      }
    }

    if (proof?.ok) {
      return { ...base, verdict: 'ok', source: sourceLabel(proof.reason), reason: proof.reason };
    }

    // Cart lines share one paid Razorpay order (receipt CART_xxx, amount is the cart total).
    // Renewals can overwrite the receipt. Live paid still means the money arrived.
    // Provision keeps the strict receipt and amount bind.
    if (
      reason === 'razorpay_receipt_mismatch' ||
      reason === 'razorpay_amount_mismatch' ||
      reason === 'hybrid_missing_gateway_or_wallet_proof'
    ) {
      if (await razorpayCaptured(gatewayOrderId)) {
        return { ...base, verdict: 'ok', source: 'Razorpay', reason: 'razorpay_live_paid' };
      }
    }

    if (
      (reason === 'upi_requires_gateway_order_or_wallet' || reason === 'missing_gateway_capture') &&
      upiGatewayPaid(order)
    ) {
      return { ...base, verdict: 'ok', source: 'UPI', reason: 'upi_gateway_confirmed' };
    }

    if (reason === 'wallet_not_deducted' && (await cartWalletCovered(userId, order))) {
      return { ...base, verdict: 'ok', source: 'Wallet', reason: 'cart_wallet_debit_verified' };
    }

    if (reason === 'untrusted_wallet_funding' && method.startsWith('wallet+') && (await razorpayCaptured(gatewayOrderId))) {
      return { ...base, verdict: 'ok', source: 'Razorpay', reason: 'hybrid_razorpay_live_paid' };
    }

    if (UNVERIFIED.has(proof?.reason)) {
      return { ...base, verdict: 'unverified', source: 'Could not reach Razorpay', reason: proof.reason };
    }
    return {
      ...base,
      verdict: 'doubt',
      source: 'Untraced',
      reason: proof?.reason || 'no_valid_payment_proof',
    };
  });

  const ok = rows.filter((r) => r.verdict === 'ok');
  const doubt = rows.filter((r) => r.verdict === 'doubt');
  const unverified = rows.filter((r) => r.verdict === 'unverified');
  doubt.sort((a, b) => b.price - a.price);

  const bySource = {};
  for (const r of ok) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
  }

  return {
    date: rangeLabel,
    from: fromKey,
    to: toKey,
    timezone: IST,
    checked: rows.length,
    okCount: ok.length,
    doubtCount: doubt.length,
    unverifiedCount: unverified.length,
    doubtInr: doubt.reduce((s, r) => s + r.price, 0),
    bySource,
    doubt,
    unverified,
  };
}

module.exports = { auditDeliveredPayments, todayKey };
