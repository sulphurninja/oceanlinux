const { isAdvpsOrder } = require('@/lib/advpsRebuildLimit');
const { toPlainConfigurations } = require('@/lib/advpsLiveStock');

function calculateExpiryDate(fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const expiry = new Date(base);
  expiry.setDate(expiry.getDate() + daysInMonth);
  return expiry;
}

/** Parse ADVPS expiry timestamps (ISO strings, epoch ms, etc.). */
function parseAdvpsExpiryDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First valid ADVPS expiry from status, purchase row, or other upstream fields. */
function pickAdvpsExpiryDate(...candidates) {
  for (const raw of candidates) {
    const d = parseAdvpsExpiryDate(raw);
    if (d) return d;
  }
  return null;
}

function isAdvpsProductName(name) {
  return typeof name === 'string' && /^⚡/.test(name.trimStart());
}

function ipStockLooksAdvps(ipStock) {
  if (!ipStock) return false;
  if (isAdvpsProductName(ipStock.name)) return true;
  const tags = Array.isArray(ipStock.tags) ? ipStock.tags : [];
  if (tags.some((t) => String(t).toLowerCase() === 'advps')) return true;
  if (String(ipStock.provider || '').toLowerCase() === 'advps') return true;
  const cfg = toPlainConfigurations(ipStock.defaultConfigurations);
  return Boolean(cfg?.advps);
}

/**
 * True when Ocean should take expiry from ADVPS (manual delivery / auto-provision),
 * not from payment date + days-in-month.
 */
async function orderUsesAdvpsUpstreamExpiry(order, { IPStock } = {}) {
  if (!order) return false;
  if (isAdvpsOrder(order)) return true;
  if (isAdvpsProductName(order.productName)) return true;

  if (!order.ipStockId) return false;

  const Stock = IPStock || require('@/models/ipStockModel');
  const ipStock = await Stock.findById(order.ipStockId)
    .select('name tags provider defaultConfigurations')
    .lean();

  return ipStockLooksAdvps(ipStock);
}

/**
 * Expiry to store when payment confirms.
 * ADVPS orders: null (set when admin links service or auto-provision syncs).
 */
async function resolveOrderExpiryOnPayment(order, options = {}) {
  if (await orderUsesAdvpsUpstreamExpiry(order, options)) {
    return null;
  }

  if (order?.trialVpsPackageId) {
    const TrialVpsPackage = require('@/models/trialVpsPackageModel');
    const pkg = await TrialVpsPackage.findById(order.trialVpsPackageId).select('trialDays').lean();
    const { calculateTrialExpiryDate } = require('@/lib/trialVpsBulkParse');
    return calculateTrialExpiryDate(pkg?.trialDays ?? 7);
  }

  if (order?.ipStockId) {
    const Stock = options.IPStock || require('@/models/ipStockModel');
    const ipStock = await Stock.findById(order.ipStockId).select('company').lean();
    if (ipStock?.company) {
      const { calculateCompanyExpiryDate } = await import('@/lib/expiryHelper');
      return calculateCompanyExpiryDate();
    }
  }

  return calculateExpiryDate();
}

module.exports = {
  parseAdvpsExpiryDate,
  pickAdvpsExpiryDate,
  orderUsesAdvpsUpstreamExpiry,
  resolveOrderExpiryOnPayment,
  ipStockLooksAdvps,
};
