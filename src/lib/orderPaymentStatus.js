/**

 * Single source of truth: is this order actually paid with verifiable proof?

 *

 * MongoDB document edits alone are NEVER enough:

 *   - wallet credits need HMAC proof (env secret) and/or live Razorpay

 *   - gateway orders need live Razorpay with receipt === clientTxnId

 *   - manualOverride boolean is ignored (use admin allowUnpaid API only)

 */



const Wallet = require('@/models/walletModel').default;

const WalletRecharge = require('@/models/walletRechargeModel').default;

const { verifyWalletCreditProof } = require('@/lib/walletCreditProof');



function looksLikeObjectId(value) {

  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());

}



function sortTxns(txns = []) {

  return txns.slice().sort((a, b) => {

    const ta = new Date(a.createdAt || 0).getTime();

    const tb = new Date(b.createdAt || 0).getTime();

    if (ta !== tb) return ta - tb;

    return String(a._id || '').localeCompare(String(b._id || ''));

  });

}



function receiptStem(value) {

  return String(value || '').trim().replace(/-\d+$/, '');

}



/** Same checkout receipt, including cart line suffix CART_xxx-0 vs CART_xxx. */

function receiptsBind(actual, expected) {

  if (actual === expected) return true;

  const a = receiptStem(actual);

  const e = receiptStem(expected);

  return Boolean(a && e && a === e);

}



async function razorpayOrderIsPaidForReceipt(gatewayOrderId, expectedReceipt, expectedAmountInr) {

  if (!gatewayOrderId || !String(gatewayOrderId).startsWith('order_')) {

    return { ok: false, reason: 'no_gateway_order_id' };

  }

  try {

    const { getRazorpayClient } = require('@/lib/razorpayClient');

    const razorpay = getRazorpayClient();

    if (!razorpay) return { ok: false, reason: 'razorpay_unconfigured' };



    const rzpOrder = await razorpay.orders.fetch(gatewayOrderId);

    const receipt = String(rzpOrder?.receipt || '').trim();

    const expected = String(expectedReceipt || '').trim();

    if (expected && receipt && !receiptsBind(receipt, expected)) {

      return { ok: false, reason: 'razorpay_receipt_mismatch' };

    }



    const paidPaise = Number(rzpOrder?.amount) || 0;

    if (expectedAmountInr != null && expectedAmountInr > 0 && paidPaise > 0) {

      const expectedPaise = Math.round(Number(expectedAmountInr) * 100);

      if (Math.abs(paidPaise - expectedPaise) > 200) {

        return { ok: false, reason: 'razorpay_amount_mismatch' };

      }

    }



    if (rzpOrder?.status === 'paid') {

      return { ok: true, reason: 'razorpay_live_paid' };

    }

    if (rzpOrder?.status === 'attempted') {

      const payments = await razorpay.orders.fetchPayments(gatewayOrderId);

      const captured = (payments?.items || []).find((p) => p.status === 'captured');

      if (captured) return { ok: true, reason: 'razorpay_live_captured' };

    }

    return { ok: false, reason: 'razorpay_not_captured' };

  } catch (err) {

    console.error('[PAYMENT-PROOF] Razorpay live check failed:', err.message);

    return { ok: false, reason: 'razorpay_api_error' };

  }

}



/**

 * Confirmed WalletRecharge counts only with live gateway bind (receipt) or HMAC on credit.

 */

async function rechargeIsGatewayVerified(recharge) {

  if (!recharge || recharge.status !== 'confirmed') {

    return { ok: false, reason: 'recharge_not_confirmed' };

  }

  if (!recharge.walletTxnId) {

    return { ok: false, reason: 'recharge_missing_wallet_txn' };

  }



  const gatewayOrderId = String(recharge.gatewayOrderId || '').trim();

  if (gatewayOrderId.startsWith('order_')) {

    return razorpayOrderIsPaidForReceipt(

      gatewayOrderId,

      recharge.clientTxnId,

      recharge.amount

    );

  }



  // Non-Razorpay UPI: require non-ObjectId gateway txn + confirmedAt + amount

  const pd = recharge.paymentDetails || {};

  const txn = String(recharge.transactionId || pd.upi_txn_id || pd.payment_id || '').trim();

  if (

    txn &&

    !looksLikeObjectId(txn) &&

    txn.length >= 8 &&

    pd.confirmedAt &&

    Number(recharge.amount) > 0 &&

    recharge.walletTxnId

  ) {

    // Still weaker than Razorpay — HMAC on the credit row is the real gate

    return { ok: true, reason: 'upi_meta_present', weak: true };

  }



  return { ok: false, reason: 'recharge_no_gateway_proof' };

}



/**

 * Balance explained only by HMAC-signed credits / live-verified recharges − all debits.

 */

async function trustedLedgerBalance(wallet) {

  if (!wallet) return 0;

  const userId = wallet.userId;

  const txns = sortTxns(wallet.transactions || []);

  const pendingRechargeRefs = [];

  let bal = 0;



  for (const t of txns) {

    const amt = Number(t.amount) || 0;

    if (t.type === 'debit') {

      bal -= amt;

      continue;

    }

    if (!['credit', 'bonus', 'refund'].includes(t.type)) continue;



    // HMAC proof (admin / recharge / refund issued by app) — Compass cannot forge

    const hmac = verifyWalletCreditProof(t, userId);

    if (hmac.ok) {

      bal += amt;

      continue;

    }



    // Unsigned refund of a known debit reference (net-zero if forged as pair)

    if (t.type === 'refund' && t.reference) {

      const matchedDebit = txns.some(

        (d) => d.type === 'debit' && String(d.reference || '') === String(t.reference)

      );

      if (matchedDebit) {

        bal += amt;

        continue;

      }

    }



    // Legacy unsigned recharge credit → verify live gateway on WalletRecharge

    const src = String(t.metadata?.source || '');

    const rechargeId = String(t.metadata?.rechargeId || t.reference || '');

    if (

      (src === 'wallet_recharge' || looksLikeObjectId(rechargeId)) &&

      looksLikeObjectId(rechargeId)

    ) {

      pendingRechargeRefs.push({ id: rechargeId, amount: amt, txnId: String(t._id) });

    }

    // else: untrusted — ignored (admin_panel without HMAC, planted credits, etc.)

  }



  if (pendingRechargeRefs.length) {

    const mongoose = require('mongoose');

    const ids = [...new Set(pendingRechargeRefs.map((p) => p.id))];

    const oids = ids.map((id) => new mongoose.Types.ObjectId(id));

    const recharges = await WalletRecharge.find({ _id: { $in: oids } }).lean();

    const byId = new Map(recharges.map((r) => [String(r._id), r]));



    for (const p of pendingRechargeRefs) {

      const rec = byId.get(p.id);

      if (!rec) continue;

      if (rec.walletTxnId && String(rec.walletTxnId) !== p.txnId) continue;

      const gate = await rechargeIsGatewayVerified(rec);

      // Weak UPI meta alone is not enough without HMAC — require !weak

      if (gate.ok && !gate.weak) {

        bal += p.amount;

      }

    }

  }



  return Math.round(bal * 100) / 100;

}



async function assertWalletTrustedForSpend(userId) {

  const wallet = await Wallet.findOne({ userId }).lean();

  if (!wallet) return { ok: false, reason: 'wallet_missing' };

  if (wallet.isActive === false) return { ok: false, reason: 'wallet_locked' };



  const stored = Math.round((Number(wallet.balance) || 0) * 100) / 100;

  const trusted = await trustedLedgerBalance(wallet);

  const unexplained = Math.round((stored - trusted) * 100) / 100;

  if (unexplained > 1) {

    return {

      ok: false,

      reason: 'untrusted_wallet_funding',

      stored,

      trusted,

      unexplained,

    };

  }

  return { ok: true, stored, trusted };

}



async function verifyWalletDebitForOrder(order) {

  if (!order?.walletDeduction || order.walletDeduction.deducted !== true) {

    return { ok: false, reason: 'wallet_not_deducted' };

  }

  if (order.walletDeduction.refunded === true) {

    return { ok: false, reason: 'wallet_refunded' };

  }



  const txnId = String(

    order.walletDeduction.transactionId || order.transactionId || ''

  ).trim();

  if (!txnId || !looksLikeObjectId(txnId)) {

    return { ok: false, reason: 'wallet_debit_txn_invalid' };

  }



  const userId = order.user?._id || order.user;

  if (!userId) return { ok: false, reason: 'order_user_missing' };



  const wallet = await Wallet.findOne({ userId }).lean();

  if (!wallet) return { ok: false, reason: 'wallet_missing' };



  const debit = (wallet.transactions || []).find(

    (t) => String(t._id) === txnId && t.type === 'debit'

  );

  if (!debit) return { ok: false, reason: 'wallet_debit_not_in_ledger' };



  const expectedAmt = Number(order.walletDeduction.amount);

  if (expectedAmt > 0 && Math.abs((Number(debit.amount) || 0) - expectedAmt) > 1) {

    return { ok: false, reason: 'wallet_debit_amount_mismatch' };

  }



  const funding = await assertWalletTrustedForSpend(userId);

  if (!funding.ok) return funding;



  return { ok: true, reason: 'wallet_debit_verified' };

}



/** Cart checkout debits the wallet once on the session. Child orders stay paid without their own debit row. */

async function verifyCheckoutSessionWalletDebit(order) {

  const pd = order?.paymentDetails || {};

  if (pd.confirmedViaCheckout !== true) return { ok: false, reason: 'not_checkout_order' };



  const sessionId = String(pd.checkoutSessionId || '').trim();

  if (!looksLikeObjectId(sessionId)) return { ok: false, reason: 'checkout_session_missing' };



  const CheckoutSession = require('@/models/checkoutSessionModel').default;

  const session = await CheckoutSession.findById(sessionId)

    .select('status walletAmount walletTxnId orderIds user')

    .lean();

  if (!session || session.status !== 'confirmed') return { ok: false, reason: 'checkout_not_confirmed' };

  if (!(Number(session.walletAmount) > 0) || !looksLikeObjectId(session.walletTxnId)) {

    return { ok: false, reason: 'checkout_wallet_missing' };

  }



  const orderId = String(order._id || '');

  const inCart = (session.orderIds || []).some((id) => String(id) === orderId);

  if (!inCart) return { ok: false, reason: 'order_not_in_checkout' };



  const sessionUser = String(session.user || '');

  const orderUser = String(order.user?._id || order.user || '');

  if (!sessionUser || sessionUser !== orderUser) return { ok: false, reason: 'checkout_user_mismatch' };



  return verifyWalletDebitForOrder({

    user: order.user,

    walletDeduction: {

      deducted: true,

      refunded: false,

      transactionId: String(session.walletTxnId),

      amount: Number(session.walletAmount),

    },

  });

}



async function verifyResellerWalletDebitForOrder(order) {

  if (!order?.walletDeduction || order.walletDeduction.deducted !== true) {

    return { ok: false, reason: 'reseller_wallet_not_deducted' };

  }

  if (order.walletDeduction.refunded === true) {

    return { ok: false, reason: 'reseller_wallet_refunded' };

  }



  const amount = Number(order.walletDeduction.amount) || 0;

  if (amount <= 0) return { ok: false, reason: 'reseller_wallet_amount_invalid' };



  const resellerId = order.resellerId || order.paymentDetails?.resellerId;

  if (!resellerId) return { ok: false, reason: 'reseller_id_missing' };



  const txnId = String(order.walletDeduction.transactionId || '').trim();

  const Reseller = require('@/models/resellerModel').default;

  const reseller = await Reseller.findById(resellerId).lean();

  if (!reseller) return { ok: false, reason: 'reseller_missing' };



  const txns = reseller.wallet?.transactions || [];

  const debit =

    txns.find(

      (t) =>

        (t.type === 'deduction' || t.type === 'debit') &&

        String(t.orderId || '') === String(order._id)

    ) ||

    (looksLikeObjectId(txnId)

      ? txns.find(

          (t) =>

            String(t._id) === txnId && (t.type === 'deduction' || t.type === 'debit')

        )

      : null);

  if (!debit) return { ok: false, reason: 'reseller_debit_not_in_ledger' };



  return { ok: true, reason: 'reseller_wallet_debit_verified' };

}



/**

 * Full async payment proof — use before provision / inventory fulfill.

 */

async function verifyOrderPaymentProof(order) {

  if (!order) return { ok: false, reason: 'no_order' };



  if (order.walletDeduction?.refunded === true) {

    return { ok: false, reason: 'refunded' };

  }



  // Compass can flip paymentDetails.manualOverride — NEVER trust it.

  // Complimentary delivery only via admin provision API allowUnpaid=true.



  const method = String(order.paymentMethod || '').toLowerCase();

  const txn = String(order.transactionId || '').trim();

  const pd = order.paymentDetails || {};

  const razorpayPayId = String(pd.razorpay_payment_id || '').trim();

  const payId = txn.startsWith('pay_') ? txn : razorpayPayId.startsWith('pay_') ? razorpayPayId : '';

  const upiTxn = String(pd.upi_txn_id || pd.payment_id || '').trim();

  let gatewayAmt = Number(pd.gatewayAmount) || Number(order.price) || 0;

  let gatewayOrderId = String(order.gatewayOrderId || pd.razorpay_order_id || '').trim();

  // Cart lines share one Razorpay order. The child often has only pay_ id;
  // the order_ id and the captured cart total live on the checkout session.
  if (!gatewayOrderId.startsWith('order_') && (pd.checkoutSessionId || pd.parentTxnId)) {
    try {
      const CheckoutSession = require('@/models/checkoutSessionModel').default;
      const session = pd.checkoutSessionId
        ? await CheckoutSession.findById(pd.checkoutSessionId).select('gatewayOrderId gatewayAmount status clientTxnId').lean()
        : await CheckoutSession.findOne({ clientTxnId: pd.parentTxnId }).select('gatewayOrderId gatewayAmount status clientTxnId').lean();
      if (session && session.status === 'confirmed' && String(session.gatewayOrderId || '').startsWith('order_')) {
        gatewayOrderId = String(session.gatewayOrderId);
        if (Number(session.gatewayAmount) > 0) gatewayAmt = Number(session.gatewayAmount);
      }
    } catch (err) {
      console.error('[PAYMENT-PROOF] checkout session lookup failed:', err.message);
    }
  }



  // Reseller API sets walletOnly on the order, but the money is the reseller wallet.

  if (method === 'reseller_wallet' || pd.purchasedViaResellerApi === true) {

    return verifyResellerWalletDebitForOrder(order);

  }



  // Pure wallet. Cart checkout debits once on the session; child orders
  // often have no walletDeduction row of their own.

  if (method === 'wallet' || pd.walletOnly === true) {

    if (order.walletDeduction?.deducted === true) {

      return verifyWalletDebitForOrder(order);

    }

    if (pd.confirmedViaCheckout === true) {

      return verifyCheckoutSessionWalletDebit(order);

    }

    return verifyWalletDebitForOrder(order);

  }



  // Hybrid wallet + gateway

  if (method.startsWith('wallet+')) {

    const walletPart = order.walletDeduction?.deducted

      ? await verifyWalletDebitForOrder(order)

      : { ok: true, reason: 'no_wallet_part' };

    if (order.walletDeduction?.deducted && !walletPart.ok) return walletPart;



    if (gatewayOrderId.startsWith('order_')) {

      const live = await razorpayOrderIsPaidForReceipt(

        gatewayOrderId,

        order.clientTxnId,

        gatewayAmt || null

      );

      if (live.ok) return { ok: true, reason: 'hybrid_razorpay_live' };

    }



    // Wallet-only hybrid mislabel (no gateway charge)

    if (order.walletDeduction?.deducted && gatewayAmt <= 0 && walletPart.ok) {

      return { ok: true, reason: 'hybrid_wallet_only_verified' };

    }

    return { ok: false, reason: 'hybrid_missing_gateway_or_wallet_proof' };

  }



  // Gateway-only — live Razorpay required when order_ present; no Mongo meta-only

  if (['razorpay', 'upi', 'cashfree', 'kwikupi', 'vyapar', 'paytm'].includes(method)) {

    if (gatewayOrderId.startsWith('order_')) {

      const live = await razorpayOrderIsPaidForReceipt(

        gatewayOrderId,

        order.clientTxnId,

        gatewayAmt || Number(order.price) || null

      );

      if (live.ok) return live;

      return { ok: false, reason: live.reason || 'razorpay_not_captured' };

    }



    // UPI without Razorpay order id — still require wallet debit if any, else reject

    // planted upi strings. Real UPI flows should have gatewayOrderId or wallet path.

    if (method === 'upi' && upiTxn && !looksLikeObjectId(upiTxn) && upiTxn.length >= 8 && pd.confirmedAt) {

      // Without an external verify API, refuse provision on UPI-meta-only planted docs.

      // Legitimate UPI via our gateways create gatewayOrderId or use wallet.

      return { ok: false, reason: 'upi_requires_gateway_order_or_wallet' };

    }



    if (looksLikeObjectId(txn)) {

      return { ok: false, reason: 'objectid_txn_not_gateway_proof' };

    }

    return { ok: false, reason: 'missing_gateway_capture' };

  }



  if (payId.startsWith('pay_') && gatewayOrderId.startsWith('order_')) {

    return razorpayOrderIsPaidForReceipt(

      gatewayOrderId,

      order.clientTxnId,

      gatewayAmt || Number(order.price) || null

    );

  }



  return { ok: false, reason: 'no_valid_payment_proof' };

}



/**

 * Sync legacy helper — intentionally STRICTER than before.

 * Prefer verifyOrderPaymentProof() for provision paths.

 */

function orderHasConfirmedPayment(order) {

  if (!order) return false;

  if (order.walletDeduction?.refunded === true) return false;

  // manualOverride intentionally ignored



  const method = String(order.paymentMethod || '').toLowerCase();

  const txn = String(order.transactionId || '').trim();

  const pd = order.paymentDetails || {};

  const payId =

    (txn.startsWith('pay_') && txn) ||

    (String(pd.razorpay_payment_id || '').startsWith('pay_') && String(pd.razorpay_payment_id)) ||

    '';



  if (payId && String(order.gatewayOrderId || '').startsWith('order_') && pd.confirmedAt) {

    return true;

  }



  if (

    (method === 'wallet' || method === 'reseller_wallet' || pd.walletOnly === true) &&

    order.walletDeduction?.deducted === true &&

    Number(order.walletDeduction?.amount) > 0 &&

    looksLikeObjectId(order.walletDeduction?.transactionId)

  ) {

    return true;

  }



  if (

    method.startsWith('wallet+') &&

    order.walletDeduction?.deducted === true &&

    looksLikeObjectId(order.walletDeduction?.transactionId)

  ) {

    return true;

  }



  return false;

}



module.exports = {

  orderHasConfirmedPayment,

  verifyOrderPaymentProof,

  verifyWalletDebitForOrder,

  verifyResellerWalletDebitForOrder,

  assertWalletTrustedForSpend,

  trustedLedgerBalance,

  razorpayOrderIsPaidForReceipt,

  rechargeIsGatewayVerified,

};


