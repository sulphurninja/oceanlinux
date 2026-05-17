const AdvpsAPI = require('@/services/advpsApi');

const LOG = '[ADVPS-LIVE-STOCK]';

/**
 * IPStock.defaultConfigurations is SchemaTypes.Map (Mixed values).
 * Never call .toObject({ minimize: true }) on that Map first — it often drops `advps` / Mixed payloads.
 * Also handle Mongoose map-like objects that are not `instanceof globalThis.Map`.
 */
function tryReadConfigurationsAsMap(maybe) {
  if (maybe == null || Array.isArray(maybe)) return null;
  if (typeof maybe.forEach !== 'function' || typeof maybe.get !== 'function') return null;
  const out = {};
  maybe.forEach((v, k) => {
    out[k] = deepMapToPlain(v);
  });
  return out;
}

function toPlainConfigurations(maybeMap) {
  if (maybeMap == null) return {};

  const fromMap = tryReadConfigurationsAsMap(maybeMap);
  if (fromMap) return fromMap;

  if (typeof maybeMap === 'object' && typeof maybeMap.toObject === 'function') {
    try {
      return deepMapToPlain(
        maybeMap.toObject({ flattenMaps: true, minimize: false, depopulate: true })
      );
    } catch (e) {
      console.warn(`${LOG} toPlainConfigurations toObject failed:`, e.message);
    }
  }

  if (typeof maybeMap === 'object' && !Array.isArray(maybeMap)) {
    return deepMapToPlain({ ...maybeMap });
  }

  return {};
}

/** Merge incoming defaultConfigurations without wiping keys with undefined (fixes lost advps from client JSON). */
function mergeDefaultConfigurationsPlain(existingPlain, incomingPlain) {
  const e = existingPlain && typeof existingPlain === 'object' ? { ...existingPlain } : {};
  const inc = incomingPlain && typeof incomingPlain === 'object' ? incomingPlain : {};
  const out = { ...e };
  for (const [k, v] of Object.entries(inc)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Mongoose Map inside Mixed does not JSON.stringify correctly (becomes {}).
 * Convert Maps to plain objects recursively before clone / iteration.
 */
function deepMapToPlain(obj) {
  if (obj == null) return obj;
  if (obj instanceof Date) return obj;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) return obj;

  if (obj instanceof Map) {
    const plain = {};
    obj.forEach((v, k) => {
      plain[k] = deepMapToPlain(v);
    });
    return plain;
  }

  if (typeof obj === 'object' && typeof obj.forEach === 'function' && typeof obj.get === 'function' && !Array.isArray(obj)) {
    const plain = {};
    obj.forEach((v, k) => {
      plain[k] = deepMapToPlain(v);
    });
    return plain;
  }

  if (Array.isArray(obj)) return obj.map((x) => deepMapToPlain(x));

  if (typeof obj === 'object') {
    if (typeof obj.toObject === 'function') {
      try {
        return deepMapToPlain(obj.toObject({ flattenMaps: true, minimize: false, depopulate: true }));
      } catch (_) {
        /* fall through */
      }
    }
    if (obj.constructor === Object || Object.getPrototypeOf(obj) === null) {
      const plain = {};
      for (const [k, v] of Object.entries(obj)) {
        plain[k] = deepMapToPlain(v);
      }
      return plain;
    }
    try {
      return deepMapToPlain({ ...obj });
    } catch (_) {
      return obj;
    }
  }

  return obj;
}

function cloneAdvpsForMutation(advps) {
  if (!advps || typeof advps !== 'object') return null;
  return deepMapToPlain(advps);
}

function isAdvpsIpStockName(name) {
  return typeof name === 'string' && /^⚡/.test(name.trimStart());
}

function normalizeProductId(id) {
  if (id == null) return '';
  return String(id).trim();
}

/** All ADVPS catalog ids referenced by an advps config block. */
function collectAdvpsProductIds(advps) {
  const a = deepMapToPlain(advps);
  if (!a || typeof a !== 'object') return [];
  const ids = [];
  if (a.variants && typeof a.variants === 'object') {
    for (const [, variant] of Object.entries(a.variants)) {
      const pid = normalizeProductId(variant?.productId);
      if (pid) ids.push(pid);
    }
  } else {
    const pid = normalizeProductId(a.productId);
    if (pid) ids.push(pid);
  }
  return ids;
}

function normalizeStockStatus(st) {
  return String(st ?? '').toUpperCase().replace(/-/g, '_');
}

/** In stock: quantity > 0, or ADVPS says IN_STOCK / LOW_STOCK (some APIs keep stock at 0 briefly). */
function rowLooksInStock(row) {
  const stock = Number(row?.stock ?? 0);
  const st = normalizeStockStatus(row?.stockStatus);
  if (st === 'OUT_OF_STOCK') return false;
  if (stock > 0) return true;
  return st === 'IN_STOCK' || st === 'LOW_STOCK';
}

// ADVPS production: 100 req / 15 min — cache the full stock list so page loads are free.
const STOCK_MAP_CACHE_TTL_MS = 10 * 60 * 1000;
let _stockMapCache = null;
let _stockMapCacheExpires = 0;

async function buildListStockMap(api, verbose) {
  const now = Date.now();
  if (_stockMapCache && now < _stockMapCacheExpires) {
    if (verbose) console.log(`${LOG} list merge (cached, ${Math.round((_stockMapCacheExpires - now) / 1000)}s remaining)`);
    return { ..._stockMapCache };
  }

  const t0 = now;
  const [linuxList, vpsList] = await Promise.all([
    api.productStockAll({ type: 'linux' }),
    api.productStockAll({ type: 'vps' }),
  ]);
  const stockMap = {};
  for (const p of [...linuxList, ...vpsList]) {
    const id = normalizeProductId(p.id);
    if (!id) continue;
    stockMap[id] = {
      stock: Number(p.stock || 0),
      stockStatus: p.stockStatus,
    };
  }

  _stockMapCache = { ...stockMap };
  _stockMapCacheExpires = Date.now() + STOCK_MAP_CACHE_TTL_MS;

  if (verbose) {
    console.log(`${LOG} list merge (fresh)`, {
      ms: Date.now() - t0,
      linuxRows: linuxList.length,
      vpsRows: vpsList.length,
      uniqueProductKeys: Object.keys(stockMap).length,
    });
  }
  return stockMap;
}

async function enrichMissingProductIds(api, stockMap, productIds, verbose) {
  const unique = [...new Set((productIds || []).map(normalizeProductId).filter(Boolean))].filter((id) => !stockMap[id]);
  if (verbose && unique.length > 0) {
    console.log(`${LOG} enrich by id: ${unique.length} product id(s) not in list map`, { ids: unique });
  }
  for (const id of unique) {
    try {
      const res = await api.productStockById(id);
      const row = res?.data?.stock ?? res?.data;
      if (row && (row.id != null || row.stock != null || row.stockStatus != null)) {
        const rid = normalizeProductId(row.id ?? id);
        stockMap[rid] = {
          stock: Number(row.stock ?? 0),
          stockStatus: row.stockStatus,
        };
        if (verbose) {
          console.log(`${LOG} enrich OK`, {
            productId: rid,
            stock: stockMap[rid].stock,
            stockStatus: stockMap[rid].stockStatus,
            rowLooksInStock: rowLooksInStock(stockMap[rid]),
          });
        }
      } else if (verbose) {
        console.warn(`${LOG} enrich empty body for productId=${id}`, { preview: JSON.stringify(res)?.slice(0, 200) });
      }
    } catch (e) {
      console.warn(`${LOG} enrich FAILED productId=${id}:`, e.message);
    }
  }
}

/**
 * @param {object|object[]|null} advpsBlocks
 * @param {{ verbose?: boolean }} opts — verbose logs for stock-check / debugging
 */
async function fetchAdvpsStockMap(advpsBlocks, opts = {}) {
  const verbose = opts.verbose === true;
  const t0 = Date.now();
  const api = new AdvpsAPI();
  const stockMap = await buildListStockMap(api, verbose);

  const blocks = Array.isArray(advpsBlocks)
    ? advpsBlocks
    : advpsBlocks && typeof advpsBlocks === 'object'
      ? [advpsBlocks]
      : [];

  const allIds = [];
  for (const block of blocks) {
    allIds.push(...collectAdvpsProductIds(block));
  }
  const uniqueRef = [...new Set(allIds)];
  if (verbose) {
    console.log(`${LOG} fetchAdvpsStockMap start`, {
      advpsBlocksCount: blocks.length,
      referencedProductIds: allIds.length,
      uniqueReferencedIds: uniqueRef.length,
      sampleIds: uniqueRef.slice(0, 12),
    });
  }

  await enrichMissingProductIds(api, stockMap, allIds, verbose);

  if (verbose) {
    console.log(`${LOG} fetchAdvpsStockMap complete`, {
      ms: Date.now() - t0,
      finalMapKeys: Object.keys(stockMap).length,
    });
  }
  return stockMap;
}

/**
 * Mutates plain `advps` in place (variant / single-product stock fields).
 * @param {object} logCtx — optional { label, ipStockId, verbose }
 * @returns {boolean} hasStock
 */
function applyStockMapToAdvpsBlock(advps, stockMap, logCtx) {
  if (!advps || typeof advps !== 'object') return false;

  const verbose = logCtx && logCtx.verbose === true;
  const label = logCtx?.label || '';
  const ipStockId = logCtx?.ipStockId != null ? String(logCtx.ipStockId) : '';

  if (advps.variants instanceof Map) {
    if (verbose) {
      console.log(`${LOG} apply: variants was Map → converted to plain object`, { label, ipStockId });
    }
    advps.variants = Object.fromEntries(advps.variants);
  }

  let hasStock = false;
  const variantTrace = [];

  if (advps.variants && typeof advps.variants === 'object') {
    const ramKeys = Object.keys(advps.variants);
    for (const ramKey of ramKeys) {
      const variant = advps.variants[ramKey];
      const pid = normalizeProductId(variant?.productId);
      if (!pid) {
        variantTrace.push({ ramKey, productId: null, note: 'no productId on variant' });
        continue;
      }
      if (stockMap[pid]) {
        const s = stockMap[pid];
        variant.stock = s.stock;
        variant.stockStatus = s.stockStatus;
        const inStock = rowLooksInStock(s);
        if (inStock) hasStock = true;
        variantTrace.push({
          ramKey,
          productId: pid,
          stock: s.stock,
          stockStatus: s.stockStatus,
          countsAsInStock: inStock,
        });
      } else {
        variantTrace.push({
          ramKey,
          productId: pid,
          stockMapHit: false,
          note: 'no entry in stockMap (list + enrich)',
        });
      }
    }
  } else {
    const pid = normalizeProductId(advps.productId);
    if (pid && stockMap[pid]) {
      const s = stockMap[pid];
      advps.availableStock = s.stock;
      advps.stockStatus = s.stockStatus;
      const inStock = rowLooksInStock(s);
      if (inStock) hasStock = true;
      variantTrace.push({ mode: 'single', productId: pid, stock: s.stock, stockStatus: s.stockStatus, countsAsInStock: inStock });
    } else if (pid) {
      variantTrace.push({ mode: 'single', productId: pid, stockMapHit: false });
    } else {
      variantTrace.push({ mode: 'single', note: 'no advps.productId' });
    }
  }

  if (verbose) {
    console.log(`${LOG} apply result`, {
      label,
      ipStockId,
      hasStock,
      variantTrace,
    });
  }

  return hasStock;
}

module.exports = {
  toPlainConfigurations,
  mergeDefaultConfigurationsPlain,
  deepMapToPlain,
  cloneAdvpsForMutation,
  isAdvpsIpStockName,
  collectAdvpsProductIds,
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  rowLooksInStock,
};
