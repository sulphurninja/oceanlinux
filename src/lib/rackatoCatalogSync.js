function memoryKeyToMb(memoryKey) {
  const m = String(memoryKey || '').match(/(\d+(?:\.\d+)?)\s*(gb|mb)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] || 'gb').toLowerCase();
  return unit === 'mb' ? Math.round(n) : Math.round(n * 1024);
}

function normalizeApps(product) {
  const raw = product?.apps || product?.data?.apps || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((app) => ({
    id: app.app_id ?? app.id,
    name: app.name || app.os_name || '',
    osName: app.os_name || '',
    osType: app.os_type || '',
    code: app.code || '',
  })).filter((a) => a.id != null && String(a.id).trim() !== '');
}

function pickRackatoApp(apps, { isWindows, configuredAppId } = {}) {
  const list = Array.isArray(apps) ? apps : [];
  if (!list.length) return null;

  const configured = String(configuredAppId || '').trim();
  if (configured) {
    const exact = list.find((a) => String(a.id) === configured);
    if (exact) return exact;
  }

  if (isWindows) {
    const win = list.find((a) => /windows/i.test(`${a.name} ${a.osName} ${a.code}`));
    if (win) return win;
  } else {
    const linux = list.find((a) => /ubuntu|linux|debian|centos/i.test(`${a.name} ${a.osName} ${a.code}`));
    if (linux) return linux;
  }
  return list[0];
}

function normalizeProductRow(row) {
  const productId = row.product_id ?? row.id;
  if (productId == null) return null;
  return {
    id: String(productId),
    name: row.product_name || row.name || '',
    memoryMb: row.memory_count != null ? Number(row.memory_count) : null,
    diskSize: row.disk_size != null ? Number(row.disk_size) : null,
    maxDiskSize: row.max_disk_size != null ? Number(row.max_disk_size) : null,
    diskPricePerGb: row.disk_price_per_gb_monthly,
    apps: normalizeApps(row),
  };
}

function productRows(payload) {
  const list = payload?.products || payload?.data?.products || payload?.data || payload;
  return Array.isArray(list) ? list : [];
}

function scoreProductMatch(product, { memoryMb, stockName, isWindows }) {
  let score = 0;
  const name = String(product.name || '').toLowerCase();
  const stock = String(stockName || '').toLowerCase();

  if (memoryMb != null && product.memoryMb != null) {
    if (product.memoryMb === memoryMb) score += 50;
    else if (Math.abs(product.memoryMb - memoryMb) <= 256) score += 20;
    else score -= 30;
  }

  if (/162\.4\.12|162\.4/i.test(stock) && /162\.4/i.test(name)) score += 40;
  if (isWindows && /windows/i.test(name)) score += 25;
  if (!isWindows && /linux|ubuntu/i.test(name)) score += 25;
  if (stock && name && (name.includes(stock.slice(0, 12)) || stock.includes(name.slice(0, 12)))) score += 10;

  return score;
}

function findBestCatalogProduct(products, { memoryKey, stockName, isWindows }) {
  const memoryMb = memoryKeyToMb(memoryKey);
  const rows = (Array.isArray(products) ? products : [])
    .map(normalizeProductRow)
    .filter(Boolean);

  let best = null;
  let bestScore = -Infinity;
  for (const row of rows) {
    const score = scoreProductMatch(row, { memoryMb, stockName, isWindows });
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best || bestScore < 15) return null;
  return best;
}

function resolveDiskSizeForOrder(planDisk, product) {
  const base = Number(product?.diskSize || 0) || 0;
  const requested = Number(planDisk || 0) || 0;
  const max = Number(product?.maxDiskSize || 0) || 0;
  const customAllowed = product?.diskPricePerGb != null && Number(product.diskPricePerGb) > 0;

  if (!customAllowed) {
    return { diskSize: base || requested || 50, includeDiskSize: false };
  }
  let disk = requested || base || 50;
  if (base && disk < base) disk = base;
  if (max && disk > max) disk = max;
  return { diskSize: disk, includeDiskSize: true };
}

async function resolveLiveRackatoPlan(api, stock, order, configuredPlan) {
  const isWindows = /windows/i.test(String(order?.os || stock?.name || ''));
  const productId = String(configuredPlan?.productId || '').trim();
  if (!productId) {
    throw new Error('Rackato product_id is missing on this IP stock.');
  }

  const detail = await api.getProduct(productId);
  const product = normalizeProductRow(detail?.product || detail?.data?.product || detail?.data || detail);
  if (!product) {
    throw new Error(`Rackato product ${productId} could not be loaded from the catalog.`);
  }

  const app = pickRackatoApp(product.apps, { isWindows, configuredAppId: configuredPlan?.appId });
  if (!app) {
    throw new Error(`Rackato product ${productId} has no application templates. Re-fetch products in admin.`);
  }

  const disk = resolveDiskSizeForOrder(configuredPlan?.diskSize, product);
  return {
    productId: String(product.id),
    appId: String(app.id),
    diskSize: disk.diskSize,
    includeDiskSize: disk.includeDiskSize,
    backupEnabled: configuredPlan?.backupEnabled === true,
    catalogAppName: app.name || '',
  };
}

function buildRackatoCreateOrderBody(plan, { reference, password, isWindows }) {
  const body = {
    app_id: Number(plan.appId),
    product_id: Number(plan.productId),
    instance_label: `ol-${String(reference).replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase() || 'order'}`,
    customer_reference_id: reference,
    backup_enabled: plan.backupEnabled === true,
    instance_count: 1,
    app_config: isWindows
      ? { admin_pass: password }
      : { ssh_root_pass: password, ssh_user: 'rackato' },
  };
  if (plan.includeDiskSize !== false) {
    body.disk_size = plan.diskSize;
  }
  return body;
}

module.exports = {
  memoryKeyToMb,
  normalizeApps,
  pickRackatoApp,
  normalizeProductRow,
  productRows,
  findBestCatalogProduct,
  resolveLiveRackatoPlan,
  buildRackatoCreateOrderBody,
  resolveDiskSizeForOrder,
};
