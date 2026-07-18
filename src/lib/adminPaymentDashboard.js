const PAID_STATUSES = ['confirmed', 'active', 'paid', 'completed'];
const IST = 'Asia/Kolkata';

function emptyDay() {
  return {
    vpsOrders: 0,
    vpsRevenue: 0,
    gatewayAmount: 0,
    walletUsed: 0,
    renewals: 0,
    renewalRevenue: 0,
    renewalGateway: 0,
    walletTopups: 0,
    walletTopupAmount: 0,
    totalExternalIn: 0,
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

function computeOrderAmounts(order) {
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
    return { total: price, wallet: walletAmt || price, gateway: 0 };
  }

  if (mixedMatch || walletAmt > 0) {
    if (!gatewayAmt && walletAmt > 0) {
      gatewayAmt = Math.max(0, price - walletAmt);
    }
    return { total: price, wallet: walletAmt, gateway: gatewayAmt };
  }

  if (walletAmt > 0 && gatewayAmt > 0) {
    return { total: price, wallet: walletAmt, gateway: gatewayAmt };
  }

  return { total: price, wallet: 0, gateway: gatewayAmt || price };
}

function orderPaymentDay(order) {
  const confirmedAt = order.paymentDetails?.confirmedAt;
  if (confirmedAt) {
    const d = new Date(confirmedAt);
    if (!Number.isNaN(d.getTime())) return istDayKey(d);
  }
  return istDayKey(order.createdAt);
}

function mergeDay(map, dayKey, patch) {
  const prev = map.get(dayKey) || emptyDay();
  map.set(dayKey, {
    vpsOrders: prev.vpsOrders + (patch.vpsOrders || 0),
    vpsRevenue: prev.vpsRevenue + (patch.vpsRevenue || 0),
    gatewayAmount: prev.gatewayAmount + (patch.gatewayAmount || 0),
    walletUsed: prev.walletUsed + (patch.walletUsed || 0),
    renewals: prev.renewals + (patch.renewals || 0),
    renewalRevenue: prev.renewalRevenue + (patch.renewalRevenue || 0),
    renewalGateway: prev.renewalGateway + (patch.renewalGateway || 0),
    walletTopups: prev.walletTopups + (patch.walletTopups || 0),
    walletTopupAmount: prev.walletTopupAmount + (patch.walletTopupAmount || 0),
    totalExternalIn: prev.totalExternalIn + (patch.totalExternalIn || 0),
  });
}

function finalizeDay(dayKey, row) {
  const totalExternalIn =
    row.gatewayAmount + row.renewalGateway + row.walletTopupAmount;
  return {
    date: dayKey,
    label: istDayLabel(dayKey),
    ...row,
    totalExternalIn,
    totalBusiness: row.vpsRevenue + row.renewalRevenue,
  };
}

async function buildAdminPaymentDashboard(Order, WalletRecharge, { days = 30 } = {}) {
  const todayKey = istDayKey(new Date());
  const rangeKeys = buildDayRange(todayKey, days);
  const oldestKey = rangeKeys[rangeKeys.length - 1];
  const rangeStart = new Date(`${oldestKey}T00:00:00.000+05:30`);
  const rangeEnd = new Date(`${todayKey}T23:59:59.999+05:30`);

  const [orders, recharges] = await Promise.all([
    Order.find({
      status: { $in: PAID_STATUSES },
      createdAt: { $gte: rangeStart, $lte: rangeEnd },
    })
      .select('price status paymentMethod paymentDetails walletDeduction createdAt renewalPayments')
      .lean(),
    WalletRecharge.find({
      status: 'confirmed',
      createdAt: { $gte: rangeStart, $lte: rangeEnd },
    })
      .select('amount creditedAt createdAt')
      .lean(),
  ]);

  const byDay = new Map();

  for (const order of orders) {
    const amounts = computeOrderAmounts(order);
    const dayKey = orderPaymentDay(order);
    if (!rangeKeys.includes(dayKey)) continue;

    mergeDay(byDay, dayKey, {
      vpsOrders: 1,
      vpsRevenue: amounts.total,
      gatewayAmount: amounts.gateway,
      walletUsed: amounts.wallet,
      totalExternalIn: amounts.gateway,
    });

    for (const renewal of order.renewalPayments || []) {
      const paidAt = renewal?.paidAt ? new Date(renewal.paidAt) : null;
      if (!paidAt || Number.isNaN(paidAt.getTime())) continue;
      const renewalDay = istDayKey(paidAt);
      if (!rangeKeys.includes(renewalDay)) continue;
      const amt = Number(renewal.amount) || 0;
      mergeDay(byDay, renewalDay, {
        renewals: 1,
        renewalRevenue: amt,
        renewalGateway: amt,
        totalExternalIn: amt,
      });
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
      totalExternalIn: amt,
    });
  }

  const daily = rangeKeys.map((dayKey) =>
    finalizeDay(dayKey, byDay.get(dayKey) || emptyDay())
  );

  const today = daily[0] || finalizeDay(todayKey, emptyDay());
  const last7 = daily.slice(0, 7);
  const periodTotals = daily.reduce(
    (acc, row) => ({
      vpsOrders: acc.vpsOrders + row.vpsOrders,
      vpsRevenue: acc.vpsRevenue + row.vpsRevenue,
      gatewayAmount: acc.gatewayAmount + row.gatewayAmount,
      walletUsed: acc.walletUsed + row.walletUsed,
      renewals: acc.renewals + row.renewals,
      renewalRevenue: acc.renewalRevenue + row.renewalRevenue,
      walletTopups: acc.walletTopups + row.walletTopups,
      walletTopupAmount: acc.walletTopupAmount + row.walletTopupAmount,
      totalExternalIn: acc.totalExternalIn + row.totalExternalIn,
      totalBusiness: acc.totalBusiness + row.totalBusiness,
    }),
    {
      vpsOrders: 0,
      vpsRevenue: 0,
      gatewayAmount: 0,
      walletUsed: 0,
      renewals: 0,
      renewalRevenue: 0,
      walletTopups: 0,
      walletTopupAmount: 0,
      totalExternalIn: 0,
      totalBusiness: 0,
    }
  );

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
  };
}

module.exports = {
  buildAdminPaymentDashboard,
  PAID_STATUSES,
};
