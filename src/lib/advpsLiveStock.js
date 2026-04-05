const AdvpsAPI = require('@/services/advpsApi');

function toPlainConfigurations(maybeMap) {
  if (!maybeMap) return {};
  if (typeof maybeMap.toObject === 'function') return maybeMap.toObject({ minimize: true });
  if (maybeMap instanceof Map) return Object.fromEntries(maybeMap);
  return { ...maybeMap };
}

function isAdvpsIpStockName(name) {
  return typeof name === 'string' && /^⚡/.test(name.trimStart());
}

/** All ADVPS catalog ids referenced by an advps config block. */
function collectAdvpsProductIds(advps) {
  const ids = [];
  if (!advps || typeof advps !== 'object') return ids;
  if (advps.variants && typeof advps.variants === 'object') {
    for (const [, variant] of Object.entries(advps.variants)) {
      if (variant?.productId != null) ids.push(String(variant.productId));
    }
  } else if (advps.productId != null) {
    ids.push(String(advps.productId));
  }
  return ids;
}

function normalizeStockStatus(st) {
  return String(st ?? '').toUpperCase().replace(/-/g, '_');
}

/** Treat as sellable if quantity > 0 and not explicitly out of stock. */
function rowLooksInStock(row) {
  const stock = Number(row?.stock ?? 0);
  const st = normalizeStockStatus(row?.stockStatus);
  if (st === 'OUT_OF_STOCK') return false;
  return stock > 0;
}

async function buildListStockMap(api) {
  const [linuxList, vpsList] = await Promise.all([
    api.productStockAll({ type: 'linux' }),
    api.productStockAll({ type: 'vps' }),
  ]);
  const stockMap = {};
  for (const p of [...linuxList, ...vpsList]) {
    stockMap[String(p.id)] = {
      stock: Number(p.stock || 0),
      stockStatus: p.stockStatus,
    };
  }
  return stockMap;
}

/**
 * For any id we care about but that did not appear in list endpoints, GET /products/stock/{id}.
 * Fixes missing rows (pagination edge cases, visibility filters, id drift).
 */
async function enrichMissingProductIds(api, stockMap, productIds) {
  const unique = [...new Set((productIds || []).map(String).filter(Boolean))].filter((id) => !stockMap[id]);
  for (const id of unique) {
    try {
      const res = await api.productStockById(id);
      const row = res?.data?.stock ?? res?.data;
      if (row && (row.id != null || row.stock != null || row.stockStatus != null)) {
        const rid = String(row.id ?? id);
        stockMap[rid] = {
          stock: Number(row.stock ?? 0),
          stockStatus: row.stockStatus,
        };
      }
    } catch (e) {
      console.warn(`[ADVPS-LIVE-STOCK] productStockById(${id}):`, e.message);
    }
  }
}

/**
 * Build stock map from list APIs, then ensure every productId used by your IPStock advps blocks is present.
 * @param {object|object[]|null} advpsBlocks — single advps block, array of blocks, or null/omit for list-only
 */
async function fetchAdvpsStockMap(advpsBlocks) {
  const api = new AdvpsAPI();
  const stockMap = await buildListStockMap(api);

  const blocks = Array.isArray(advpsBlocks)
    ? advpsBlocks
    : advpsBlocks && typeof advpsBlocks === 'object'
      ? [advpsBlocks]
      : [];

  const allIds = [];
  for (const block of blocks) {
    allIds.push(...collectAdvpsProductIds(block));
  }
  await enrichMissingProductIds(api, stockMap, allIds);
  return stockMap;
}

/**
 * Mutates `advps` in place (variant / single-product stock fields).
 * @returns {boolean} hasStock
 */
function applyStockMapToAdvpsBlock(advps, stockMap) {
  if (!advps || typeof advps !== 'object') return false;
  let hasStock = false;

  if (advps.variants && typeof advps.variants === 'object') {
    for (const [, variant] of Object.entries(advps.variants)) {
      const pid = variant?.productId != null ? String(variant.productId) : '';
      if (pid && stockMap[pid]) {
        const s = stockMap[pid];
        variant.stock = s.stock;
        variant.stockStatus = s.stockStatus;
        if (rowLooksInStock(s)) hasStock = true;
      }
    }
  } else {
    const pid = advps.productId != null ? String(advps.productId) : '';
    if (pid && stockMap[pid]) {
      const s = stockMap[pid];
      advps.availableStock = s.stock;
      advps.stockStatus = s.stockStatus;
      if (rowLooksInStock(s)) hasStock = true;
    }
  }

  return hasStock;
}

module.exports = {
  toPlainConfigurations,
  isAdvpsIpStockName,
  collectAdvpsProductIds,
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
};
