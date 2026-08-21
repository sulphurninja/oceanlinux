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
function buildGstExportRows(
  orders,
  walletRecharges,
  { gatewayFilter = 'all', salesPercent = 100, attributionRecharges = [] } = {},
) {
  const salesFactor = Math.min(100, Math.max(1, Number(salesPercent) || 100)) / 100;

  const rechargePool = [...(walletRecharges || []), ...(attributionRecharges || [])];
  const seenRecharge = new Set();
  const rechargesByUserId = new Map();
  for (const r of rechargePool) {
    const id = String(r._id);
    if (seenRecharge.has(id)) continue;
    seenRecharge.add(id);
    const uid = String(r.user?._id || r.user || '');
    if (!rechargesByUserId.has(uid)) rechargesByUserId.set(uid, []);
    rechargesByUserId.get(uid).push(r);
  }

  const rows = [];

  for (const order of orders || []) {
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
      paymentChannel: gateway === 'razorpay' ? 'Razorpay' : gateway === 'upi' ? 'UPI (KwikUPI)' : gateway,
      entryType: 'VPS Order',
    });
    if (salesPercent !== 100) row['Report Sales %'] = salesPercent;
    rows.push(row);
  }

  for (const recharge of walletRecharges || []) {
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
      paymentChannel: gateway === 'razorpay' ? 'Razorpay' : gateway === 'upi' ? 'UPI (KwikUPI)' : gateway,
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
