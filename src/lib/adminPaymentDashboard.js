const PAID_STATUSES = ['confirmed', 'active', 'paid', 'completed'];
const IST = 'Asia/Kolkata';

function emptyDay() {
  return {
    vpsOrders: 0,
    vpsRevenue: 0,
    vpsWalletOnly: 0,
    vpsGatewayOnly: 0,
    vpsMixed: 0,
    vpsCartOrders: 0,
    vpsGatewayAmount: 0,
    vpsWalletAmount: 0,
    cartCheckouts: 0,
    cartGatewayAmount: 0,
    cartWalletAmount: 0,
    renewals: 0,
    renewalRevenue: 0,
    renewalGatewayAmount: 0,
    renewalWalletAmount: 0,
    renewalGatewayCount: 0,
    renewalWalletCount: 0,
    walletTopups: 0,
    walletTopupAmount: 0,
    walletSpentOnOrders: 0,
    walletSpentOnRenewals: 0,
    totalBusiness: 0,
  };
}

function istDayKey(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: IST });
}

function istDayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('en-IN', {
    timeZone: IST,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function addDaysToDayKey(dayKey, delta) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toLocaleDateString('en-CA', { timeZone: IST });
}

function buildDayRange(endDayKey, count) {
  const keys = [];
  for (let i = 0; i < count; i += 1) {
    keys.push(addDaysToDayKey(endDayKey, -i));
  }
  return keys;
}

function isCartChildOrder(order) {
  return Boolean(
    order.parentTxnId ||
      order.checkoutSessionId ||
      order.paymentDetails?.confirmedViaCheckout ||
      order.paymentDetails?.checkoutSessionId
  );
}

function computeStandaloneOrderAmounts(order) {
  const price = Number(order.price) || 0;
  const method = String(order.paymentMethod || '').toLowerCase();
  const walletAmt =
    Number(order.paymentDetails?.walletAmount) ||
    (order.walletDeduction?.deducted ? Number(order.walletDeduction.amount) : 0) ||
    0;
  let gatewayAmt = Number(order.paymentDetails?.gatewayAmount) || 0;
  const mixedMatch = method.match(/^wallet\+(.+)$/);

  const walletOnly =
    order.paymentDetails?.walletOnly === true ||
    method === 'wallet' ||
    (walletAmt > 0 && gatewayAmt === 0 && !order.gatewayOrderId && !mixedMatch);

  if (walletOnly) {
    return { total: price, wallet: walletAmt || price, gateway: 0, kind: 'wallet' };
  }

  if (mixedMatch || walletAmt > 0) {
    if (!gatewayAmt && walletAmt > 0) {
      gatewayAmt = Math.max(0, price - walletAmt);
    }
    return { total: price, wallet: walletAmt, gateway: gatewayAmt, kind: 'mixed' };
  }

  if (walletAmt > 0 && gatewayAmt > 0) {
    return { total: price, wallet: walletAmt, gateway: gatewayAmt, kind: 'mixed' };
  }

  return { total: price, wallet: 0, gateway: gatewayAmt || price, kind: 'gateway' };
}

function computeRenewalAmounts(renewal) {
  const total = Number(renewal.amount) || 0;
  const gatewayAmt = Number(renewal.paymentDetails?.gatewayAmount);
  const walletAmt = Number(renewal.paymentDetails?.walletAmount);
  if (gatewayAmt > 0 || walletAmt > 0) {
    const gateway = gatewayAmt > 0 ? gatewayAmt : Math.max(0, total - walletAmt);
    const wallet = walletAmt > 0 ? walletAmt : Math.max(0, total - gatewayAmt);
    return {
      total,
      gateway,
      wallet,
      kind: gateway > 0 && wallet > 0 ? 'mixed' : wallet > 0 ? 'wallet' : 'gateway',
    };
  }
  const method = String(renewal.paymentMethod || '').toLowerCase();
  if (method === 'wallet' || method.startsWith('wallet')) {
    return { total, gateway: 0, wallet: total, kind: 'wallet' };
  }
  return { total, gateway: total, wallet: 0, kind: 'gateway' };
}

function renewalPaidOnDay(renewal, dayKey) {
  const paidAt = renewal?.paidAt ? new Date(renewal.paidAt) : null;
  if (!paidAt || Number.isNaN(paidAt.getTime())) return false;
  return istDayKey(paidAt) === dayKey;
}

function orderPaymentDay(order) {
  const confirmedAt = order.paymentDetails?.confirmedAt;
  if (confirmedAt) {
    const d = new Date(confirmedAt);
    if (!Number.isNaN(d.getTime())) return istDayKey(d);
  }
  return istDayKey(order.createdAt);
}

/** Original VPS sale day — renewals overwrite paymentDetails on the order doc. */
function vpsSaleDay(order) {
  const renewals = order.renewalPayments || [];
  if (renewals.length === 0) return orderPaymentDay(order);

  const firstRenewalAt = new Date(renewals[0].paidAt);
  const confirmedAt = order.paymentDetails?.confirmedAt
    ? new Date(order.paymentDetails.confirmedAt)
    : null;
  if (
    confirmedAt &&
    !Number.isNaN(confirmedAt.getTime()) &&
    !Number.isNaN(firstRenewalAt.getTime()) &&
    confirmedAt < firstRenewalAt
  ) {
    return istDayKey(confirmedAt);
  }
  return istDayKey(order.createdAt);
}

function gatewayCaptureKey(source) {
  return (
    source.transactionId ||
    source.gatewayOrderId ||
    source.clientTxnId ||
    source.paymentId ||
    source.renewalTxnId ||
    null
  );
}

/** Matches Razorpay dashboard — pay_* / order_* IDs or razorpay paymentMethod. */
function isRazorpaySource(source) {
  const method = String(source.paymentMethod || '').toLowerCase();
  if (method.includes('upi') || method.includes('kwikupi')) return false;
  if (method === 'wallet' || (method.startsWith('wallet') && !method.includes('razorpay'))) {
    return false;
  }
  if (method.includes('razorpay')) return true;
  const txnId = String(source.transactionId || source.paymentId || '');
  const gwOrderId = String(source.gatewayOrderId || '');
  if (txnId.startsWith('pay_')) return true;
  if (gwOrderId.startsWith('order_')) return true;
  return false;
}

/** KwikUPI inline UPI — paymentMethod upi / wallet+upi or stored UPI txn metadata. */
function isUpiSource(source) {
  const method = String(source.paymentMethod || '').toLowerCase();
  if (method.includes('upi') || method.includes('kwikupi')) return true;
  const pd = source.paymentDetails || {};
  if (pd.kwikUpiPaymentId || pd.upi_txn_id) return true;
  return false;
}

function classifyPaymentGateway(source) {
  if (isRazorpaySource(source)) return 'razorpay';
  if (isUpiSource(source)) return 'upi';
  return 'other';
}

function summarizeGatewayCaptures(captureMap) {
  const empty = {
    gatewayCaptures: 0,
    gatewayCollected: 0,
    razorpayCaptures: 0,
    razorpayCollected: 0,
    razorpayVpsAmount: 0,
    razorpayCartAmount: 0,
    razorpayRenewalAmount: 0,
    razorpayTopupAmount: 0,
    upiCaptures: 0,
    upiCollected: 0,
    upiVpsAmount: 0,
    upiCartAmount: 0,
    upiRenewalAmount: 0,
    upiTopupAmount: 0,
    otherGatewayCaptures: 0,
    otherGatewayCollected: 0,
  };
  if (!captureMap?.size) return empty;

  let gatewayCollected = 0;
  let razorpayCollected = 0;
  let upiCollected = 0;
  let otherGatewayCollected = 0;
  let razorpayCaptures = 0;
  let upiCaptures = 0;
  let otherGatewayCaptures = 0;
  const razorpayByBucket = { vps: 0, cart: 0, renewal: 0, topup: 0 };
  const upiByBucket = { vps: 0, cart: 0, renewal: 0, topup: 0 };

  for (const capture of captureMap.values()) {
    gatewayCollected += capture.amount;
    if (capture.gateway === 'razorpay') {
      razorpayCaptures += 1;
      razorpayCollected += capture.amount;
      razorpayByBucket[capture.bucket] = (razorpayByBucket[capture.bucket] || 0) + capture.amount;
    } else if (capture.gateway === 'upi') {
      upiCaptures += 1;
      upiCollected += capture.amount;
      upiByBucket[capture.bucket] = (upiByBucket[capture.bucket] || 0) + capture.amount;
    } else {
      otherGatewayCaptures += 1;
      otherGatewayCollected += capture.amount;
    }
  }

  return {
    gatewayCaptures: captureMap.size,
    gatewayCollected,
    razorpayCaptures,
    razorpayCollected,
    razorpayVpsAmount: razorpayByBucket.vps || 0,
    razorpayCartAmount: razorpayByBucket.cart || 0,
    razorpayRenewalAmount: razorpayByBucket.renewal || 0,
    razorpayTopupAmount: razorpayByBucket.topup || 0,
    upiCaptures,
    upiCollected,
    upiVpsAmount: upiByBucket.vps || 0,
    upiCartAmount: upiByBucket.cart || 0,
    upiRenewalAmount: upiByBucket.renewal || 0,
    upiTopupAmount: upiByBucket.topup || 0,
    otherGatewayCaptures,
    otherGatewayCollected,
  };
}

function mergeDay(map, dayKey, patch) {
  const prev = map.get(dayKey) || emptyDay();
  map.set(dayKey, {
    vpsOrders: prev.vpsOrders + (patch.vpsOrders || 0),
    vpsRevenue: prev.vpsRevenue + (patch.vpsRevenue || 0),
    vpsWalletOnly: prev.vpsWalletOnly + (patch.vpsWalletOnly || 0),
    vpsGatewayOnly: prev.vpsGatewayOnly + (patch.vpsGatewayOnly || 0),
    vpsMixed: prev.vpsMixed + (patch.vpsMixed || 0),
    vpsCartOrders: prev.vpsCartOrders + (patch.vpsCartOrders || 0),
    vpsGatewayAmount: prev.vpsGatewayAmount + (patch.vpsGatewayAmount || 0),
    vpsWalletAmount: prev.vpsWalletAmount + (patch.vpsWalletAmount || 0),
    cartCheckouts: prev.cartCheckouts + (patch.cartCheckouts || 0),
    cartGatewayAmount: prev.cartGatewayAmount + (patch.cartGatewayAmount || 0),
    cartWalletAmount: prev.cartWalletAmount + (patch.cartWalletAmount || 0),
    renewals: prev.renewals + (patch.renewals || 0),
    renewalRevenue: prev.renewalRevenue + (patch.renewalRevenue || 0),
    renewalGatewayAmount: prev.renewalGatewayAmount + (patch.renewalGatewayAmount || 0),
    renewalWalletAmount: prev.renewalWalletAmount + (patch.renewalWalletAmount || 0),
    renewalGatewayCount: prev.renewalGatewayCount + (patch.renewalGatewayCount || 0),
    renewalWalletCount: prev.renewalWalletCount + (patch.renewalWalletCount || 0),
    walletTopups: prev.walletTopups + (patch.walletTopups || 0),
    walletTopupAmount: prev.walletTopupAmount + (patch.walletTopupAmount || 0),
    walletSpentOnOrders: prev.walletSpentOnOrders + (patch.walletSpentOnOrders || 0),
    walletSpentOnRenewals: prev.walletSpentOnRenewals + (patch.walletSpentOnRenewals || 0),
    totalBusiness: prev.totalBusiness + (patch.totalBusiness || 0),
  });
}

function finalizeDay(dayKey, row, captureMap) {
  const captureStats = summarizeGatewayCaptures(captureMap);
  const walletSpent = row.vpsWalletAmount + row.cartWalletAmount + row.walletSpentOnRenewals;
  return {
    date: dayKey,
    label: istDayLabel(dayKey),
    ...row,
    ...captureStats,
    walletSpent,
    walletAdded: row.walletTopupAmount,
    totalBusiness: row.vpsRevenue + row.renewalRevenue,
    // Legacy aliases used by older UI bits
    gatewayAmount: row.vpsGatewayAmount + row.cartGatewayAmount,
    walletUsed: walletSpent,
    renewalGateway: row.renewalGatewayAmount,
    totalExternalIn: captureStats.gatewayCollected,
  };
}

async function buildAdminPaymentDashboard(Order, WalletRecharge, CheckoutSession, { days = 30 } = {}) {
  const todayKey = istDayKey(new Date());
  const rangeKeys = buildDayRange(todayKey, days);
  const oldestKey = rangeKeys[rangeKeys.length - 1];
  const rangeStart = new Date(`${oldestKey}T00:00:00.000+05:30`);
  const rangeEnd = new Date(`${todayKey}T23:59:59.999+05:30`);

  const sessionQuery = CheckoutSession
    ? CheckoutSession.find({
        status: 'confirmed',
        $or: [
          { confirmedAt: { $gte: rangeStart, $lte: rangeEnd } },
          { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
        ],
      })
        .select('clientTxnId gatewayOrderId transactionId walletAmount gatewayAmount total confirmedAt createdAt paymentMethod paymentDetails')
        .lean()
    : Promise.resolve([]);

  const [orders, recharges, cartSessions] = await Promise.all([
    Order.find({
      status: { $in: PAID_STATUSES },
      $or: [
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
        { 'paymentDetails.confirmedAt': { $gte: rangeStart, $lte: rangeEnd } },
        { 'renewalPayments.paidAt': { $gte: rangeStart, $lte: rangeEnd } },
      ],
    })
      .select(
        'price status paymentMethod paymentDetails walletDeduction createdAt renewalPayments parentTxnId checkoutSessionId transactionId gatewayOrderId clientTxnId'
      )
      .lean(),
    WalletRecharge.find({
      status: 'confirmed',
      $or: [
        { creditedAt: { $gte: rangeStart, $lte: rangeEnd } },
        { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
      ],
    })
      .select('amount creditedAt createdAt clientTxnId transactionId gatewayOrderId paymentMethod paymentDetails')
      .lean(),
    sessionQuery,
  ]);

  const byDay = new Map();
  const gatewayCapturesByDay = new Map();

  function trackGatewayCapture(dayKey, source, amount, bucket) {
    const key = gatewayCaptureKey(source);
    if (!key || !(amount > 0)) return;
    if (!gatewayCapturesByDay.has(dayKey)) gatewayCapturesByDay.set(dayKey, new Map());
    const dayCaptures = gatewayCapturesByDay.get(dayKey);
    const keyStr = String(key);
    if (dayCaptures.has(keyStr)) return;
    dayCaptures.set(keyStr, {
      amount,
      bucket,
      gateway: classifyPaymentGateway(source),
    });
  }

  for (const order of orders) {
    const saleDay = vpsSaleDay(order);
    if (!rangeKeys.includes(saleDay)) continue;

    const price = Number(order.price) || 0;
    if (isCartChildOrder(order)) {
      mergeDay(byDay, saleDay, {
        vpsOrders: 1,
        vpsRevenue: price,
        vpsCartOrders: 1,
        totalBusiness: price,
      });
      continue;
    }

    const amounts = computeStandaloneOrderAmounts(order);
    const patch = {
      vpsOrders: 1,
      vpsRevenue: amounts.total,
      vpsGatewayAmount: amounts.gateway,
      vpsWalletAmount: amounts.wallet,
      walletSpentOnOrders: amounts.wallet,
      totalBusiness: amounts.total,
    };
    if (amounts.kind === 'wallet') patch.vpsWalletOnly = 1;
    else if (amounts.kind === 'gateway') patch.vpsGatewayOnly = 1;
    else if (amounts.kind === 'mixed') patch.vpsMixed = 1;

    mergeDay(byDay, saleDay, patch);

    if (amounts.gateway > 0) {
      trackGatewayCapture(saleDay, order, amounts.gateway, 'vps');
    }
  }

  for (const session of cartSessions) {
    const when = session.confirmedAt || session.createdAt;
    const dayKey = istDayKey(when);
    if (!rangeKeys.includes(dayKey)) continue;

    const gatewayAmt = Number(session.gatewayAmount) || 0;
    const walletAmt = Number(session.walletAmount) || 0;
    mergeDay(byDay, dayKey, {
      cartCheckouts: 1,
      cartGatewayAmount: gatewayAmt,
      cartWalletAmount: walletAmt,
      walletSpentOnOrders: walletAmt,
      totalBusiness: 0,
    });

    if (gatewayAmt > 0) {
      trackGatewayCapture(dayKey, session, gatewayAmt, 'cart');
    }
  }

  for (const order of orders) {
    for (const renewal of order.renewalPayments || []) {
      const renewalDay = renewal?.paidAt ? istDayKey(new Date(renewal.paidAt)) : null;
      if (!renewalDay || !rangeKeys.includes(renewalDay)) continue;
      if (!renewalPaidOnDay(renewal, renewalDay)) continue;

      const renewalAmounts = computeRenewalAmounts(renewal);
      const patch = {
        renewals: 1,
        renewalRevenue: renewalAmounts.total,
        renewalGatewayAmount: renewalAmounts.gateway,
        renewalWalletAmount: renewalAmounts.wallet,
        walletSpentOnRenewals: renewalAmounts.wallet,
        totalBusiness: renewalAmounts.total,
      };
      if (renewalAmounts.gateway > 0) patch.renewalGatewayCount = 1;
      if (renewalAmounts.wallet > 0) patch.renewalWalletCount = 1;

      mergeDay(byDay, renewalDay, patch);

      if (renewalAmounts.gateway > 0) {
        trackGatewayCapture(renewalDay, renewal, renewalAmounts.gateway, 'renewal');
      }
    }
  }

  for (const recharge of recharges) {
    const when = recharge.creditedAt || recharge.createdAt;
    const dayKey = istDayKey(when);
    if (!rangeKeys.includes(dayKey)) continue;
    const amt = Number(recharge.amount) || 0;
    mergeDay(byDay, dayKey, {
      walletTopups: 1,
      walletTopupAmount: amt,
    });
    trackGatewayCapture(dayKey, recharge, amt, 'topup');
  }

  const daily = rangeKeys.map((dayKey) =>
    finalizeDay(dayKey, byDay.get(dayKey) || emptyDay(), gatewayCapturesByDay.get(dayKey))
  );

  const today = daily[0] || finalizeDay(todayKey, emptyDay());
  const last7 = daily.slice(0, 7);

  const sumFields = (rows) =>
    rows.reduce(
      (acc, row) => ({
        vpsOrders: acc.vpsOrders + row.vpsOrders,
        vpsRevenue: acc.vpsRevenue + row.vpsRevenue,
        vpsWalletOnly: acc.vpsWalletOnly + row.vpsWalletOnly,
        vpsGatewayOnly: acc.vpsGatewayOnly + row.vpsGatewayOnly,
        vpsMixed: acc.vpsMixed + row.vpsMixed,
        vpsCartOrders: acc.vpsCartOrders + row.vpsCartOrders,
        vpsGatewayAmount: acc.vpsGatewayAmount + row.vpsGatewayAmount,
        vpsWalletAmount: acc.vpsWalletAmount + row.vpsWalletAmount,
        cartCheckouts: acc.cartCheckouts + row.cartCheckouts,
        cartGatewayAmount: acc.cartGatewayAmount + row.cartGatewayAmount,
        cartWalletAmount: acc.cartWalletAmount + row.cartWalletAmount,
        renewals: acc.renewals + row.renewals,
        renewalRevenue: acc.renewalRevenue + row.renewalRevenue,
        renewalGatewayAmount: acc.renewalGatewayAmount + row.renewalGatewayAmount,
        renewalWalletAmount: acc.renewalWalletAmount + row.renewalWalletAmount,
        renewalGatewayCount: acc.renewalGatewayCount + row.renewalGatewayCount,
        renewalWalletCount: acc.renewalWalletCount + row.renewalWalletCount,
        walletTopups: acc.walletTopups + row.walletTopups,
        walletTopupAmount: acc.walletTopupAmount + row.walletTopupAmount,
        gatewayCaptures: acc.gatewayCaptures + row.gatewayCaptures,
        gatewayCollected: acc.gatewayCollected + row.gatewayCollected,
        razorpayCaptures: acc.razorpayCaptures + row.razorpayCaptures,
        razorpayCollected: acc.razorpayCollected + row.razorpayCollected,
        razorpayVpsAmount: acc.razorpayVpsAmount + row.razorpayVpsAmount,
        razorpayCartAmount: acc.razorpayCartAmount + row.razorpayCartAmount,
        razorpayRenewalAmount: acc.razorpayRenewalAmount + row.razorpayRenewalAmount,
        razorpayTopupAmount: acc.razorpayTopupAmount + row.razorpayTopupAmount,
        upiCaptures: acc.upiCaptures + row.upiCaptures,
        upiCollected: acc.upiCollected + row.upiCollected,
        upiVpsAmount: acc.upiVpsAmount + row.upiVpsAmount,
        upiCartAmount: acc.upiCartAmount + row.upiCartAmount,
        upiRenewalAmount: acc.upiRenewalAmount + row.upiRenewalAmount,
        upiTopupAmount: acc.upiTopupAmount + row.upiTopupAmount,
        otherGatewayCaptures: acc.otherGatewayCaptures + row.otherGatewayCaptures,
        otherGatewayCollected: acc.otherGatewayCollected + row.otherGatewayCollected,
        walletSpentOnOrders: acc.walletSpentOnOrders + row.walletSpentOnOrders,
        walletSpentOnRenewals: acc.walletSpentOnRenewals + row.walletSpentOnRenewals,
        totalBusiness: acc.totalBusiness + row.totalBusiness,
        gatewayAmount: acc.gatewayAmount + row.gatewayAmount,
        walletUsed: acc.walletUsed + row.walletUsed,
        renewalGateway: acc.renewalGateway + row.renewalGateway,
        totalExternalIn: acc.totalExternalIn + row.totalExternalIn,
      }),
      {
        vpsOrders: 0,
        vpsRevenue: 0,
        vpsWalletOnly: 0,
        vpsGatewayOnly: 0,
        vpsMixed: 0,
        vpsCartOrders: 0,
        vpsGatewayAmount: 0,
        vpsWalletAmount: 0,
        cartCheckouts: 0,
        cartGatewayAmount: 0,
        cartWalletAmount: 0,
        renewals: 0,
        renewalRevenue: 0,
        renewalGatewayAmount: 0,
        renewalWalletAmount: 0,
        renewalGatewayCount: 0,
        renewalWalletCount: 0,
        walletTopups: 0,
        walletTopupAmount: 0,
        gatewayCaptures: 0,
        gatewayCollected: 0,
        razorpayCaptures: 0,
        razorpayCollected: 0,
        razorpayVpsAmount: 0,
        razorpayCartAmount: 0,
        razorpayRenewalAmount: 0,
        razorpayTopupAmount: 0,
        upiCaptures: 0,
        upiCollected: 0,
        upiVpsAmount: 0,
        upiCartAmount: 0,
        upiRenewalAmount: 0,
        upiTopupAmount: 0,
        otherGatewayCaptures: 0,
        otherGatewayCollected: 0,
        walletSpentOnOrders: 0,
        walletSpentOnRenewals: 0,
        totalBusiness: 0,
        gatewayAmount: 0,
        walletUsed: 0,
        renewalGateway: 0,
        totalExternalIn: 0,
      }
    );

  const periodTotals = sumFields(daily);

  return {
    timezone: IST,
    today,
    last7,
    daily,
    periodTotals,
    range: {
      from: oldestKey,
      to: todayKey,
      days,
    },
    notes: [
      'VPS Sold = total new orders (single + cart items). Cart ke liye gateway ek baar count hota hai, har item alag order.',
      'Razorpay = pay_* / order_* ya paymentMethod razorpay / wallet+razorpay — Razorpay dashboard se match karo.',
      'UPI = paymentMethod upi / wallet+upi (KwikUPI) — buy, cart, renewal, wallet top-up sab count hote hain.',
      'All Gateway = Razorpay + UPI + legacy (purane Cashfree) unique captures.',
      'Wallet Used = orders + renewals paid from wallet balance (pehle top-up hua tha).',
    ],
  };
}

module.exports = {
  buildAdminPaymentDashboard,
  PAID_STATUSES,
};
