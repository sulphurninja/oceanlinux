function netbayCfgFromStock(stock) {
  if (!stock) return {};
  return (
    stock.defaultConfigurations?.get?.('netbay') ||
    stock.defaultConfigurations?.netbay ||
    {}
  );
}

function listNetbayGroupTags(stock) {
  const cfg = netbayCfgFromStock(stock);
  const out = [];
  if (Array.isArray(cfg.groupTags)) out.push(...cfg.groupTags);
  if (cfg.groupTag) out.push(cfg.groupTag);
  return [...new Set(out.map((t) => String(t).trim()).filter(Boolean))];
}

function resolveNetbayGroupTag(stock, requested) {
  const allowed = listNetbayGroupTags(stock);
  const want = String(requested || '').trim();
  if (want && allowed.includes(want)) return want;
  if (want && allowed.length && !allowed.includes(want)) return null;
  if (allowed.length) return allowed[0];
  return String(netbayCfgFromStock(stock).groupTag || '').trim();
}

/** Nexa dedicated-IP plans are also serverType Proxy. They are not Netbay products. */
function isNexaDedicatedIpStock(stock) {
  if (!stock) return false;
  const tags = Array.isArray(stock.tags) ? stock.tags : [];
  if (tags.some((tag) => String(tag).toLowerCase() === 'nexa')) return true;
  const nexa = stock.defaultConfigurations?.get?.('nexa') || stock.defaultConfigurations?.nexa;
  return !!(nexa && (nexa.planId || nexa.poolId));
}

/** HTTP proxy Applications product (Netbay GET/POST /api/v1/proxy/*). */
function isNetbayProxyStock(stock) {
  if (isNexaDedicatedIpStock(stock)) return false;
  const cfg = netbayCfgFromStock(stock);
  const type = String(cfg.productType || '').toLowerCase();
  const tmpl = String(cfg.proxyTemplate || '').toUpperCase();
  const linuxOs = String(cfg.defaultOs?.Linux || cfg.defaultOs?.get?.('Linux') || '').toUpperCase();
  const server = String(stock?.serverType || '').toLowerCase();
  return type === 'proxy' || tmpl === 'PROXY' || linuxOs === 'PROXY' || server === 'proxy';
}

function isNetbayProxyOrder(order, ipStock) {
  if (!order && !ipStock) return false;
  if (String(order?.netbayProductKind || '').toLowerCase() === 'proxy') return true;
  return isNetbayProxyStock(ipStock);
}

/** Coupon product kind for NetBay auto-buy — matches store tabs / IPStock serverType. */
function resolveNetbayCouponProductKind(stock, order) {
  if (isNetbayProxyOrder(order, stock)) return 'proxy';
  const st = String(stock?.serverType || '').trim();
  if (st === 'VPS') return 'vps';
  if (st === 'Proxy') return 'proxy';
  return 'linux';
}

function memoryOptionsToPlain(memoryOptions) {
  if (!memoryOptions) return {};
  if (memoryOptions instanceof Map) return Object.fromEntries(memoryOptions);
  return memoryOptions;
}

function pickPricedMemoryKey(memoryOptions) {
  const options = memoryOptionsToPlain(memoryOptions);
  const preferred = ['4GB', '8GB', '2GB', 'proxy', 'slot'];
  for (const k of preferred) {
    if (options[k]?.price != null && Number(options[k].price) > 0) return k;
  }
  const found = Object.entries(options).find(([, d]) => d?.price != null && Number(d.price) > 0);
  return found ? found[0] : '';
}

/** Internal RAM key used for planId / custom price; reseller may send a groupTag instead. */
function resolveNetbayBillingMemory(stock, requested) {
  const options = memoryOptionsToPlain(stock?.memoryOptions);
  const want = String(requested || '').trim();
  if (want && options[want]?.price != null && Number(options[want].price) > 0) return want;
  if (isNetbayProxyStock(stock)) return pickPricedMemoryKey(options);
  return want;
}

function netbayProxyTemplateName(stock) {
  const cfg = netbayCfgFromStock(stock);
  const tmpl = String(cfg.proxyTemplate || cfg.defaultOs?.Linux || cfg.defaultOs?.get?.('Linux') || 'PROXY').trim();
  return tmpl || 'PROXY';
}

/** proxyUser = lowercase [a-z][a-z0-9]* */
function generateNetbayProxyUser() {
  const n = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 10) || 'user';
  return `ol${n}`.toLowerCase().replace(/[^a-z0-9]/g, 'a').slice(0, 16);
}

/** proxyPass = letters / numbers / @ */
function generateNetbayProxyPass(length = 14) {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const all = `${letters}${numbers}@`;
  const chars = ['A', 'a', '1', '@'];
  while (chars.length < length) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  return chars.sort(() => Math.random() - 0.5).join('');
}

module.exports = {
  netbayCfgFromStock,
  listNetbayGroupTags,
  resolveNetbayGroupTag,
  isNexaDedicatedIpStock,
  isNetbayProxyStock,
  isNetbayProxyOrder,
  resolveNetbayCouponProductKind,
  pickPricedMemoryKey,
  resolveNetbayBillingMemory,
  netbayProxyTemplateName,
  generateNetbayProxyUser,
  generateNetbayProxyPass,
};
