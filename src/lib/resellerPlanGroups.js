/**
 * Group store products so reseller API custom rates can be bulk-applied
 * (Flex 8GB/16GB once, then pick products) instead of one row at a time.
 */

export function readStockConfig(stock, key) {
  const dc = stock?.defaultConfigurations;
  if (!dc) return null;
  if (typeof dc.get === 'function') return dc.get(key) || null;
  return dc[key] || null;
}

/** "8GB Vps" / "8GB Linux" / "16GB" → "8GB" / "16GB" */
export function ramBucket(memoryKey) {
  const raw = String(memoryKey || '').trim();
  if (/^slot$/i.test(raw)) return 'slot';
  const m = raw.toUpperCase().replace(/\s+/g, '');
  const match = m.match(/^(\d+)GB/);
  return match ? `${match[1]}GB` : '';
}

export function resellerPlanGroup(stock, companyNameById = {}) {
  const name = String(stock?.name || '');
  const tags = (Array.isArray(stock?.tags) ? stock.tags : []).map((t) =>
    String(t).toLowerCase()
  );

  if (stock?.serverType === 'SlotIP' || stock?.memoryOptions?.slot) {
    return 'Slot IP / Proxy';
  }
  if (String(stock?.serverType || '').toLowerCase() === 'proxy') {
    return 'Proxy (store)';
  }

  if (name.startsWith('⚡') && /LINUX/i.test(name)) return 'Flex LINUX';
  if (name.startsWith('⚡') || readStockConfig(stock, 'advps') || tags.includes('advps')) {
    return 'Flex / ADVPS';
  }
  if (name.startsWith('🌊')) return 'Ocean Linux (SmartVPS)';
  if (name.startsWith('📍')) return 'Rotating Linux';
  if (/Windows RDP/i.test(name) && /GOLD Pro\+/i.test(name)) return 'Rotating VPS GOLD';
  if (/Windows RDP/i.test(name) && /AMD Pro\+/i.test(name)) return 'Rotating VPS AMD';
  if (/Windows Server 2022/i.test(name) && /Starter/i.test(name)) return 'Windows Starter';

  if (name.startsWith('🐧') || /Linux IP/i.test(name)) {
    return 'Oceanlinux Linux IP';
  }
  if (/Windows RDP/i.test(name) && /Xeon Gold/i.test(name)) {
    return 'Oceanlinux Windows RDP';
  }

  if (
    readStockConfig(stock, 'netbay') ||
    tags.includes('netbay') ||
    stock?.netbayUseLiveStockApi
  ) {
    return 'Netbay';
  }
  if (readStockConfig(stock, 'kurohost') || tags.includes('kurohost')) {
    return 'KuroHost';
  }
  if (
    readStockConfig(stock, 'smartvps') ||
    tags.includes('smartvps') ||
    tags.includes('ocean linux')
  ) {
    return 'Ocean Linux (SmartVPS)';
  }

  const companyId = stock?.company ? String(stock.company) : '';
  if (companyId && companyNameById[companyId]) {
    return `Company: ${companyNameById[companyId]}`;
  }

  if (/Windows RDP/i.test(name)) return 'Windows RDP (other)';
  return 'Other';
}

export function memoryKeysForGroup(stocks) {
  const buckets = new Set();
  for (const stock of stocks || []) {
    const options = stock?.memoryOptions || {};
    for (const key of Object.keys(options)) {
      const bucket = ramBucket(key);
      if (bucket) buckets.add(bucket);
    }
  }
  return [...buckets].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export function pricedMemoryEntries(stock) {
  return Object.entries(stock?.memoryOptions || {}).filter(
    ([, details]) => Number(details?.price) > 0
  );
}

export function toCustomPriceRecord(customPrices) {
  if (!customPrices) return {};
  if (customPrices instanceof Map) return Object.fromEntries(customPrices);
  return customPrices;
}

/** Direct key first, then legacy keys with the same RAM bucket (e.g. "4GB Linux" → "4GB"). */
export function getCustomPriceForStockMemory(stockId, memoryKey, customPrices = {}) {
  const prices = toCustomPriceRecord(customPrices);
  const id = String(stockId || '');
  const mem = String(memoryKey || '').trim();
  if (!id || !mem) return null;

  const direct = Number(prices[`${id}_${mem}`]);
  if (direct > 0) return direct;

  const bucket = ramBucket(mem);
  if (!bucket || bucket === 'slot') return null;

  const prefix = `${id}_`;
  for (const [key, raw] of Object.entries(prices)) {
    if (!key.startsWith(prefix)) continue;
    if (ramBucket(key.slice(prefix.length)) !== bucket) continue;
    const value = Number(raw);
    if (value > 0) return value;
  }

  return null;
}

/** status: set | partial | missing | none */
export function stockCustomStatus(stock, customPrices = {}) {
  const entries = pricedMemoryEntries(stock);
  if (!entries.length) {
    return { total: 0, set: 0, missing: 0, status: 'none', setRates: [], missingKeys: [] };
  }
  const setRates = [];
  const missingKeys = [];
  for (const [mem] of entries) {
    const value = getCustomPriceForStockMemory(stock._id, mem, customPrices);
    if (value > 0) setRates.push(`${mem} ₹${value}`);
    else missingKeys.push(mem);
  }
  const set = setRates.length;
  const status = set === 0 ? 'missing' : set === entries.length ? 'set' : 'partial';
  return { total: entries.length, set, missing: missingKeys.length, status, setRates, missingKeys };
}
