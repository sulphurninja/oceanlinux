import Order from '@/models/orderModel';
import CheckoutSession from '@/models/checkoutSessionModel';
import WalletRecharge from '@/models/walletRechargeModel';
import User from '@/models/userModel';
import { getVyaparCredentials, getResellerRechargeSettings } from '@/lib/resellerRechargeSettings';
import { createVyaparOrderWithUniqueAmount } from '@/lib/vyaparGateway';
import { UPI_PROVIDER_VYAPAR } from '@/lib/paymentGateways';

const OPEN_ORDER_STATUSES = ['pending', 'processing'];

/** Pending Vyapar UPI orders older than this are not auto-refreshed. */
export const VYAPAR_REFRESH_MAX_AGE_MS = 45 * 60 * 1000;

/** Minimum gap between two refreshes for the same txn (Vyapar orders last ~2 min). */
export const VYAPAR_REFRESH_MIN_GAP_MS = 85 * 1000;

/** Refresh when QR expires within this window (or already expired). */
export const VYAPAR_REFRESH_EXPIRY_SOON_MS = 50 * 1000;

function parseExpiryMs(record) {
  const raw =
    record?.paymentDetails?.upiExpiresAt ||
    record?.pendingRenewal?.upiExpiresAt ||
    null;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function lastRefreshMs(record) {
  const raw =
    record?.paymentDetails?.upiLastRefreshAt ||
    record?.pendingRenewal?.upiLastRefreshAt ||
    null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function recordCreatedMs(record) {
  const t = new Date(record?.createdAt || record?.updatedAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Whether a pending Vyapar UPI record should get a fresh gateway order now.
 */
export function shouldRefreshVyaparUpi(record) {
  if (!record) return false;
  const method = String(record.paymentMethod || record.pendingRenewal?.paymentMethod || '');
  if (!method.includes('upi')) return false;

  const provider =
    record.paymentDetails?.upiProvider ||
    record.pendingRenewal?.upiProvider ||
    UPI_PROVIDER_VYAPAR;
  if (provider !== UPI_PROVIDER_VYAPAR) return false;

  const expiryMs = parseExpiryMs(record);
  if (expiryMs == null) return false;

  if (Date.now() - recordCreatedMs(record) > VYAPAR_REFRESH_MAX_AGE_MS) return false;
  if (Date.now() - lastRefreshMs(record) < VYAPAR_REFRESH_MIN_GAP_MS) return false;

  return expiryMs - Date.now() <= VYAPAR_REFRESH_EXPIRY_SOON_MS;
}

async function buildRefreshTarget(txnId, userId, preloaded) {
  if (txnId.startsWith('RENEWAL_')) {
    const order =
      preloaded ||
      (await Order.findOne({ 'pendingRenewal.renewalTxnId': txnId }));
    if (!order) return null;
    if (userId && String(order.user) !== String(userId)) return null;
    const pending = order.pendingRenewal || {};
    return {
      doc: order,
      kind: 'renewal',
      settled: !pending.renewalTxnId,
      paymentMethod: pending.paymentMethod,
      baseAmount: Math.max(
        0,
        Number(pending.amount || 0) - (Number(pending.walletAmount) || 0)
      ),
      description: `Renewal ${order.productName || ''}`.trim(),
      userId: order.user,
      persist: async (created) => {
        order.pendingRenewal.gatewayOrderId = created.orderId;
        order.pendingRenewal.gatewayAmount = created.chargedAmount;
        order.pendingRenewal.upiExpiresAt = created.expiresAt;
        order.pendingRenewal.upiLastRefreshAt = new Date();
        order.markModified('pendingRenewal');
        await order.save();
      },
    };
  }

  if (txnId.startsWith('WALLET_')) {
    const recharge = preloaded || (await WalletRecharge.findOne({ clientTxnId: txnId }));
    if (!recharge) return null;
    if (userId && String(recharge.user) !== String(userId)) return null;
    const base =
      Number(recharge.paymentDetails?.baseAmount) ||
      Math.round(Number(recharge.amount) || 0);
    return {
      doc: recharge,
      kind: 'wallet',
      settled: !OPEN_ORDER_STATUSES.includes(recharge.status),
      paymentMethod: recharge.paymentMethod,
      baseAmount: base,
      description: 'Wallet recharge',
      userId: recharge.user,
      persist: async (created) => {
        recharge.gatewayOrderId = created.orderId;
        recharge.amount = created.chargedAmount;
        recharge.paymentDetails = {
          ...(recharge.paymentDetails || {}),
          gatewayAmount: created.chargedAmount,
          baseAmount: base,
          upiProvider: UPI_PROVIDER_VYAPAR,
          upiExpiresAt: created.expiresAt,
          upiLastRefreshAt: new Date(),
        };
        await recharge.save();
      },
    };
  }

  if (txnId.startsWith('CART_')) {
    const session = preloaded || (await CheckoutSession.findOne({ clientTxnId: txnId }));
    if (!session) return null;
    if (userId && String(session.user) !== String(userId)) return null;
    return {
      doc: session,
      kind: 'cart',
      settled: !OPEN_ORDER_STATUSES.includes(session.status),
      paymentMethod: session.paymentMethod,
      baseAmount: Math.max(0, Number(session.total || 0) - (Number(session.walletAmount) || 0)),
      description: 'Cart checkout',
      userId: session.user,
      persist: async (created) => {
        session.gatewayOrderId = created.orderId;
        session.gatewayAmount = created.chargedAmount;
        session.paymentDetails = {
          ...(session.paymentDetails || {}),
          upiProvider: UPI_PROVIDER_VYAPAR,
          upiExpiresAt: created.expiresAt,
          upiLastRefreshAt: new Date(),
        };
        await session.save();
      },
    };
  }

  const order = preloaded || (await Order.findOne({ clientTxnId: txnId }));
  if (!order) return null;
  if (userId && String(order.user) !== String(userId)) return null;
  return {
    doc: order,
    kind: 'order',
    settled: !OPEN_ORDER_STATUSES.includes(order.status),
    paymentMethod: order.paymentMethod,
    baseAmount: Math.max(
      0,
      Number(order.price || 0) - (Number(order.paymentDetails?.walletAmount) || 0)
    ),
    description: `${order.productName || 'Order'} - ${order.memory || ''}`.trim(),
    userId: order.user,
    persist: async (created) => {
      order.gatewayOrderId = created.orderId;
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        gatewayAmount: created.chargedAmount,
        upiProvider: UPI_PROVIDER_VYAPAR,
        upiExpiresAt: created.expiresAt,
        upiLastRefreshAt: new Date(),
      };
      order.markModified('paymentDetails');
      await order.save();
    },
  };
}

/**
 * Re-issue Vyapar gateway order for an open UPI payment.
 * @param {string} clientTxnId
 * @param {{ userId?: string, doc?: object, force?: boolean }} opts
 */
export async function refreshVyaparUpiForTxnId(clientTxnId, opts = {}) {
  const txnId = String(clientTxnId || '').trim();
  if (!txnId) return { refreshed: false, reason: 'missing txn id' };

  const target = await buildRefreshTarget(txnId, opts.userId, opts.doc);
  if (!target) return { refreshed: false, reason: 'not found' };
  if (target.settled) return { refreshed: false, reason: 'already settled', alreadyPaid: true };
  if (!String(target.paymentMethod || '').includes('upi')) {
    return { refreshed: false, reason: 'not upi' };
  }
  if (!opts.force && !shouldRefreshVyaparUpi(target.doc)) {
    return { refreshed: false, reason: 'refresh not needed yet' };
  }
  if (target.baseAmount <= 0) return { refreshed: false, reason: 'nothing to pay' };

  const settings = await getResellerRechargeSettings();
  const vyapar = getVyaparCredentials(settings);
  if (!vyapar) return { refreshed: false, reason: 'vyapar not configured' };

  const user = await User.findById(target.userId).select('name email phone').lean();

  let created;
  try {
    created = await createVyaparOrderWithUniqueAmount({
      apiKey: vyapar.apiKey,
      amount: target.baseAmount,
      clientTxnId: txnId,
      customerName: user?.name,
      customerEmail: user?.email,
      customerMobile: user?.phone,
      description: target.description,
    });
  } catch (err) {
    return { refreshed: false, reason: err.message };
  }

  await target.persist(created);

  return {
    refreshed: true,
    clientTxnId: txnId,
    kind: target.kind,
    gatewayOrderId: created.orderId,
    amount: created.chargedAmount,
    expiresAt: created.expiresAt,
    qrImageUrl: created.qrImageUrl,
    paymentUrl: created.paymentUrl,
  };
}

/**
 * Cron: refresh all pending Vyapar UPI payments that are expiring soon.
 */
export async function refreshExpiringVyaparUpiPayments(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 80);
  const since = new Date(Date.now() - VYAPAR_REFRESH_MAX_AGE_MS);
  const refreshed = [];
  const skipped = [];

  const pendingOrders = await Order.find({
    status: 'pending',
    paymentMethod: /upi/i,
    'paymentDetails.upiProvider': UPI_PROVIDER_VYAPAR,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  for (const order of pendingOrders) {
    if (!shouldRefreshVyaparUpi(order)) {
      skipped.push({ clientTxnId: order.clientTxnId, reason: 'not due' });
      continue;
    }
    const result = await refreshVyaparUpiForTxnId(order.clientTxnId, {
      doc: order,
      force: true,
    });
    if (result.refreshed) {
      refreshed.push({
        kind: 'order',
        clientTxnId: order.clientTxnId,
        gatewayOrderId: result.gatewayOrderId,
        amount: result.amount,
      });
    } else {
      skipped.push({ clientTxnId: order.clientTxnId, reason: result.reason });
    }
  }

  const pendingSessions = await CheckoutSession.find({
    status: { $in: OPEN_ORDER_STATUSES },
    paymentMethod: /upi/i,
    'paymentDetails.upiProvider': UPI_PROVIDER_VYAPAR,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  for (const session of pendingSessions) {
    if (!shouldRefreshVyaparUpi(session)) continue;
    const result = await refreshVyaparUpiForTxnId(session.clientTxnId, {
      doc: session,
      force: true,
    });
    if (result.refreshed) {
      refreshed.push({
        kind: 'cart',
        clientTxnId: session.clientTxnId,
        gatewayOrderId: result.gatewayOrderId,
      });
    }
  }

  return {
    success: true,
    scannedOrders: pendingOrders.length,
    scannedCarts: pendingSessions.length,
    refreshedCount: refreshed.length,
    refreshed,
    skipped: skipped.length ? skipped.slice(0, 20) : undefined,
  };
}

export { buildRefreshTarget as findVyaparRefreshTarget };
