function readConfigBlock(stock) {
  const configs = stock?.defaultConfigurations;
  if (!configs) return {};
  if (typeof configs.get === 'function') return configs.get('rackato') || {};
  return configs.rackato || {};
}

function readRackatoStockConfig(stock) {
  const raw = readConfigBlock(stock) || {};
  const byMemory = raw.productByMemory || raw.byMemory || {};
  return {
    productId: raw.productId || raw.product_id || '',
    appId: raw.appId || raw.app_id || '',
    diskSize: Number(raw.diskSize || raw.disk_size || 0) || 0,
    backupEnabled: raw.backupEnabled === true || raw.backup_enabled === true,
    byMemory: byMemory instanceof Map ? Object.fromEntries(byMemory) : byMemory,
  };
}

function resolveRackatoPlan(stock, memory) {
  const cfg = readRackatoStockConfig(stock);
  const key = String(memory || '').trim();
  const row = (key && cfg.byMemory && cfg.byMemory[key]) || {};
  return {
    productId: String(row.productId || row.product_id || cfg.productId || '').trim(),
    appId: String(row.appId || row.app_id || cfg.appId || '').trim(),
    diskSize: Number(row.diskSize || row.disk_size || cfg.diskSize || 50) || 50,
    backupEnabled: row.backupEnabled != null ? !!row.backupEnabled : cfg.backupEnabled,
  };
}

function stockHasRackatoPlan(stock) {
  const plan = resolveRackatoPlan(stock, '');
  return !!(plan.productId && plan.appId);
}

/** True when manage actions should route to the Rackato reseller API. */
function isRackatoPanelStock(stock, order) {
  if (order?.provider === 'rackato') return true;
  if (String(order?.rackatoOrderId || '').trim()) return true;
  if (String(order?.rackatoNodeUid || '').trim()) return true;
  if (!stock) return false;
  const tags = (stock.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes('rackato')) return true;
  if (String(stock.provider || '').toLowerCase() === 'rackato') return true;
  return stockHasRackatoPlan(stock);
}

module.exports = {
  readRackatoStockConfig,
  resolveRackatoPlan,
  stockHasRackatoPlan,
  isRackatoPanelStock,
};
