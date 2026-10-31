/** GST sales export — split Razorpay vs UPI (KwikUPI) for admin reports. */

const GST_SELLER_STATE = 'Maharashtra';
const GST_RATE = 18;
const GST_SAC_CODE = '998315';

function r2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function cleanProductName(s) {
  return String(s || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Reseller wallet, reseller API buys, and reseller-account payments stay out of GST. */
function isResellerOrder(order) {
  if (order?.user?.userType === 'reseller') return true;
  const method = String(order?.paymentMethod || '').toLowerCase();
  if (method === 'reseller_wallet' || method.includes('reseller_wallet')) return true;
  if (order?.resellerId) return true;
  const details = order?.paymentDetails || {};
  if (details.purchasedViaResellerApi === true) return true;
  if (String(details.method || '').toLowerCase() === 'reseller_wallet') return true;
  return false;
}

function isResellerRecharge(recharge) {
  if (recharge?.user?.userType === 'reseller') return true;
  const details = recharge?.paymentDetails || {};
  if (details.reroutedToResellerWallet === true) return true;
  if (details.resellerId) return true;
  const method = String(recharge?.paymentMethod || '').toLowerCase();
  return method.includes('reseller');
}

/** @returns {'razorpay'|'upi'|'other'|'wallet_unattributed'} */
function classifyGatewayFromMethod(method, paymentDetails = {}) {
  const m = String(method || '').toLowerCase();
  if (m.includes('upi') || m.includes('kwikupi')) return 'upi';
  if (m.includes('razorpay')) return 'razorpay';
  if (paymentDetails?.kwikUpiPaymentId || paymentDetails?.upi_txn_id) return 'upi';
  if (m === 'cashfree') return 'other';
  const txn = String(paymentDetails?.transactionId || paymentDetails?.paymentId || '');
  if (txn.startsWith('pay_')) return 'razorpay';
  if (m === 'wallet') return 'wallet_unattributed';
  return 'other';
}

function orderPaidAt(order) {
  const confirmed = order?.paymentDetails?.confirmedAt;
  if (confirmed) {
    const d = new Date(confirmed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(order.createdAt);
}

/**
 * Wallet-only orders: attribute to the user's most recent confirmed top-up
 * before payment (UPI top-up → UPI report, Razorpay top-up → Razorpay report).
 */
function classifyWalletOnlyOrder(order, rechargesByUserId) {
  const userId = String(order?.user?._id || order?.user || '');
  const list = rechargesByUserId.get(userId) || [];
  const paidAt = orderPaidAt(order).getTime();
  const eligible = list
    .filter((r) => {
      const when = new Date(r.creditedAt || r.createdAt).getTime();
      return when <= paidAt;
    })
    .sort((a, b) => new Date(b.creditedAt || b.createdAt) - new Date(a.creditedAt || a.createdAt));
  const last = eligible[0];
  if (!last) return 'wallet_unattributed';
  return classifyGatewayFromMethod(last.paymentMethod, last.paymentDetails || {});
}

/** @returns {'razorpay'|'upi'|'other'|'wallet_unattributed'} */
function classifyOrderGateway(order, rechargesByUserId) {
  const method = String(order.paymentMethod || '').toLowerCase();
  if (method.includes('razorpay')) return 'razorpay';
  if (method.includes('upi') || method.includes('kwikupi')) return 'upi';
  if (method === 'wallet' || order.paymentDetails?.walletOnly === true) {
    return classifyWalletOnlyOrder(order, rechargesByUserId);
  }
  const fromMethod = classifyGatewayFromMethod(order.paymentMethod, order.paymentDetails || {});
  if (fromMethod === 'wallet_unattributed') {
    return classifyWalletOnlyOrder(order, rechargesByUserId);
  }
  return fromMethod;
}

function classifyRechargeGateway(recharge) {
  return classifyGatewayFromMethod(recharge.paymentMethod, recharge.paymentDetails || {});
}

function buildGstRow({
  invoiceNo,
  invoiceDate,
  partyName,
  billing,
  itemName,
  price,
  originalPrice,
  salesFactor,
  paymentChannel,
  entryType,
}) {
  const div = 1 + GST_RATE / 100;
  const scaleAmount = (n) => r2(n * salesFactor);
  const orig = Number(originalPrice ?? price);
  const grossTaxable = scaleAmount(r2(orig / div));
  const taxableAmount = scaleAmount(r2(price / div));
  const discountTaxable = scaleAmount(r2(Math.max(0, orig / div - price / div)));
  const gst = scaleAmount(r2(price - price / div));

  const state = String(billing?.state || '').trim();
  const intra = !!state && state.toLowerCase() === GST_SELLER_STATE.toLowerCase();
  const cgst = intra ? r2(gst / 2) : 0;
  const sgst = intra ? r2(gst - cgst) : 0;
  const igst = intra ? 0 : gst;

  const addressParts = [billing?.line, billing?.city].filter(Boolean);

  return {
    'Invoice No': invoiceNo,
    'Invoice Date': invoiceDate,
    'Party name': partyName,
    'GST Number(If Applicable)': '',
    Address: addressParts.join(', '),
    Pincode: billing?.pincode || '',
    'State Of Supply': state || '',
    'Item Name': itemName,
    'SAC Code': GST_SAC_CODE,
    Qty: 1,
    Rate: grossTaxable,
    'gross amount': grossTaxable,
    Discount: discountTaxable,
    'Taxable Amount': taxableAmount,
    CGST: cgst,
    SGST: sgst,
    IGST: igst,
    'Net Invoice Value': scaleAmount(price),
    'Payment Channel': paymentChannel,
    'Entry Type': entryType,
  };
}

function formatInvoiceDate(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Build GST CSV rows for a date range, filtered by gateway bucket.
 * @param {'razorpay'|'upi'|'all'} gatewayFilter
 * @param {object[]} [attributionRecharges] — extra confirmed top-ups for wallet-only order attribution (any date ≤ range end)
 */
function isResellerRenewal(order, renewal) {
  if (isResellerOrder(order)) return true;
  const method = String(renewal?.paymentMethod || renewal?.paymentDetails?.method || '').toLowerCase();
  return method === 'reseller_wallet' || method.includes('reseller_wallet');
}

function paymentChannelLabel(gateway) {
  if (gateway === 'razorpay') return 'Razorpay';
  if (gateway === 'upi') return 'UPI (KwikUPI)';
  return gateway;
}

function renewalInRange(renewal, range) {
  if (!range) return true;
  const paid = new Date(renewal?.paidAt || 0).getTime();
  return paid >= range.from.getTime() && paid <= range.to.getTime();
}

function classifyRenewalGateway(order, renewal, rechargesByUserId) {
  const details = {
    ...(renewal?.paymentDetails || {}),
    transactionId: renewal?.paymentDetails?.transactionId || renewal?.paymentId || '',
    paymentId: renewal?.paymentId || renewal?.paymentDetails?.paymentId || '',
  };
  return classifyOrderGateway(
    {
      paymentMethod: renewal?.paymentMethod || details.method || '',
      paymentDetails: details,
      user: order?.user,
      createdAt: renewal?.paidAt,
      price: renewal?.amount,
    },
    rechargesByUserId,
  );
}

function buildGstExportRows(
  orders,
  walletRecharges,
  { gatewayFilter = 'all', salesPercent = 100, attributionRecharges = [], renewalOrders = [], range = null } = {},
) {
  const salesFactor = Math.min(100, Math.max(1, Number(salesPercent) || 100)) / 100;

  const rechargePool = [...(walletRecharges || []), ...(attributionRecharges || [])];
  const seenRecharge = new Set();
  const rechargesByUserId = new Map();
  for (const r of rechargePool) {
    if (isResellerRecharge(r)) continue;
    const id = String(r._id);
    if (seenRecharge.has(id)) continue;
    seenRecharge.add(id);
    const uid = String(r.user?._id || r.user || '');
    if (!rechargesByUserId.has(uid)) rechargesByUserId.set(uid, []);
    rechargesByUserId.get(uid).push(r);
  }

  const rows = [];

  for (const order of orders || []) {
    if (isResellerOrder(order)) continue;
    const gateway = classifyOrderGateway(order, rechargesByUserId);
    if (gatewayFilter !== 'all' && gateway !== gatewayFilter) continue;

    const price = Number(order.price || 0);
    const billing = order.user?.billingAddress || {};
    const invoiceNo = order.invoiceNumber || `OL-${String(order._id).slice(-8).toUpperCase()}`;
    const baseName = cleanProductName(order.productName);
    const itemName = order.memory ? `${baseName} - ${order.memory}` : baseName;

    const row = buildGstRow({
      invoiceNo,
      invoiceDate: formatInvoiceDate(order.createdAt),
      partyName: order.customerName || order.user?.name || 'N/A',
      billing,
      itemName,
      price,
      originalPrice: order.originalPrice ?? price,
      salesFactor,
      paymentChannel: paymentChannelLabel(gateway),
      entryType: 'VPS Order',
    });
    if (salesPercent !== 100) row['Report Sales %'] = salesPercent;
    rows.push(row);
  }

  for (const order of renewalOrders || []) {
    if (isResellerOrder(order)) continue;
    const billing = order.user?.billingAddress || {};
    const baseName = cleanProductName(order.productName);
    const itemName = order.memory ? `${baseName} - ${order.memory} Renewal` : `${baseName} Renewal`;

    for (const renewal of order.renewalPayments || []) {
      if (!renewalInRange(renewal, range)) continue;
      if (isResellerRenewal(order, renewal)) continue;
      const gateway = classifyRenewalGateway(order, renewal, rechargesByUserId);
      if (gatewayFilter !== 'all' && gateway !== gatewayFilter) continue;

      const price = Number(renewal.amount || 0);
      if (!(price > 0)) continue;
      const row = buildGstRow({
        invoiceNo: renewal.invoiceNumber || `OLR-${String(renewal.renewalTxnId || renewal.paymentId || '').slice(-8).toUpperCase()}`,
        invoiceDate: formatInvoiceDate(renewal.paidAt),
        partyName: order.customerName || order.user?.name || 'N/A',
        billing,
        itemName,
        price,
        originalPrice: price,
        salesFactor,
        paymentChannel: paymentChannelLabel(gateway),
        entryType: 'VPS Renewal',
      });
      if (salesPercent !== 100) row['Report Sales %'] = salesPercent;
      rows.push(row);
    }
  }

  for (const recharge of walletRecharges || []) {
    if (isResellerRecharge(recharge)) continue;
    const gateway = classifyRechargeGateway(recharge);
    if (gatewayFilter !== 'all' && gateway !== gatewayFilter) continue;

    const price = Number(recharge.amount || 0);
    const user = recharge.user || {};
    const billing = user.billingAddress || {};
    const invoiceNo = `WT-${String(recharge._id).slice(-8).toUpperCase()}`;

    const row = buildGstRow({
      invoiceNo,
      invoiceDate: formatInvoiceDate(recharge.creditedAt || recharge.createdAt),
      partyName: user.name || 'N/A',
      billing,
      itemName: 'OceanLinux Wallet Top-up',
      price,
      originalPrice: price,
      salesFactor,
      paymentChannel: paymentChannelLabel(gateway),
      entryType: 'Wallet Top-up',
    });
    if (salesPercent !== 100) row['Report Sales %'] = salesPercent;
    rows.push(row);
  }

  rows.sort((a, b) => {
    const da = a['Invoice Date'].split('-').reverse().join('-');
    const db = b['Invoice Date'].split('-').reverse().join('-');
    return db.localeCompare(da);
  });

  return rows;
}

module.exports = {
  GST_SELLER_STATE,
  GST_RATE,
  GST_SAC_CODE,
  classifyOrderGateway,
  classifyRechargeGateway,
  buildGstExportRows,
};
