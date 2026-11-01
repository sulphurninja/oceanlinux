const NexaApi = require('@/services/nexaApi');

function mapPool(pool) {
  return {
    poolId: pool.pool_id ?? pool.id ?? null,
    name: pool.pool_name || pool.name || '',
    subnet: pool.subnet || '',
    location: pool.location || '',
    regularPrice: pool.regular_price ?? null,
    apiPrice: pool.api_price ?? pool.price ?? null,
    currency: pool.currency || 'INR',
    inStock: pool.in_stock !== false,
    stock: pool.stock ?? null,
  };
}

function mapPlan(plan) {
  const pools = Array.isArray(plan.pools) ? plan.pools.map(mapPool) : [];
  return {
    planId: plan.plan_id ?? plan.id ?? null,
    name: plan.plan_name || plan.name || '',
    category: plan.category_name || '',
    tier: plan.tier || '',
    tierLabel: plan.tier_label || '',
    controlMode: plan.control_mode || '',
    location: plan.location || plan.country_name || '',
    duration: plan.duration || '',
    speed: plan.speed || '',
    protocol: plan.protocol || '',
    protocols: Array.isArray(plan.supported_protocols) ? plan.supported_protocols : [],
    regularPrice: plan.regular_price ?? null,
    apiPrice: plan.api_price ?? null,
    currency: plan.currency || 'INR',
    inStock: plan.in_stock !== false,
    stock: plan.stock ?? null,
    subnet: plan.default_subnet || '',
    pools,
  };
}

function mapPlansPayload(payload) {
  return (Array.isArray(payload?.plans) ? payload.plans : []).map(mapPlan);
}

/** Customer-facing price — Nexa user/regular rate only (never API cost). */
function nexaStoreSellPrice(pool, plan) {
  const regular = Number(
    pool?.regularPrice ?? pool?.regular_price ?? plan?.regularPrice ?? plan?.regular_price
  );
  if (Number.isFinite(regular) && regular > 0) return Math.round(regular);
  return 0;
}

function stockUnits(value, inStock) {
  if (inStock === false) return 0;
  if (value == null || value === '' || String(value).toLowerCase() === 'unlimited') return 100;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100000, Math.floor(n));
}

function unitsFromPoolRaw(pool) {
  if (!pool) return { available: false, stockCount: 0 };
  const mapped = pool.poolId != null ? pool : mapPool(pool);
  const raw = mapped.stock;
  const markedOut = mapped.inStock === false || raw === 0 || raw === '0';
  if (markedOut) return { available: false, stockCount: 0 };
  if (raw == null || raw === '' || String(raw).toLowerCase() === 'unlimited') {
    return { available: true, stockCount: 100 };
  }
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return { available: false, stockCount: 0 };
  return { available: true, stockCount: Math.min(100000, Math.floor(count)) };
}

function unitsFromNexaPoolAndPlan(pool, plan) {
  const p = pool?.poolId != null ? pool : mapPool(pool || {});
  const pl = plan?.planId != null ? plan : mapPlan(plan || {});
  if (pl.inStock === false) return { available: false, stockCount: 0 };
  const fromPool = unitsFromPoolRaw(p);
  if (!fromPool.available) return fromPool;
  const planRaw = pl.stock;
  if (planRaw === 0 || planRaw === '0') return { available: false, stockCount: 0 };
  if (planRaw == null || planRaw === '' || String(planRaw).toLowerCase() === 'unlimited') {
    return fromPool;
  }
  const planCount = Number(planRaw);
  if (!Number.isFinite(planCount) || planCount <= 0) return { available: false, stockCount: 0 };
  const capped = Math.min(fromPool.stockCount, Math.floor(planCount));
  return { available: capped > 0, stockCount: capped };
}

function nexaStockKey(planId, poolId) {
  return `${Number(planId)}:${poolId != null && poolId !== '' ? Number(poolId) : ''}`;
}

function normalizeSubnet(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Match Nexa subnet labels like 212.11.8.xx vs 212.11.8.0/24 */
function subnetsMatch(a, b) {
  const x = normalizeSubnet(a);
  const y = normalizeSubnet(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const strip = (v) => v.replace(/\.xx$/i, '').replace(/\/\d+$/, '');
  const px = strip(x);
  const py = strip(y);
  if (px && py && (px === py || px.startsWith(py) || py.startsWith(px))) return true;
  return false;
}

function buildNexaStockName(plan, pool) {
  const rawName = String(plan.name || '').trim();
  const planTitle =
    rawName === 'Bcast App-login' || rawName === 'Broadcast'
      ? '📡 Broadcast Proxy'
      : plan.name;
  const rawLabel = [planTitle, pool?.subnet || pool?.name].filter(Boolean).join(' — ');
  const planEmoji = {
    'Diamond IPs': '💎',
    Broadcast: '📡',
    'Premium Native IPs': '⭐',
    'Web Login': '🔐',
  }[String(plan.name || '').trim()];
  if (planEmoji && !String(rawLabel).startsWith(planEmoji)) {
    return rawLabel.replace(String(plan.name).trim(), `${planEmoji} ${String(plan.name).trim()}`);
  }
  return rawLabel || `Nexa plan ${plan.planId}`;
}

function buildPoolStockMapFromPlans(plans) {
  const byPool = new Map();
  const pairs = [];
  for (const plan of plans) {
    if (Array.isArray(plan.pools) && plan.pools.length) {
      for (const pool of plan.pools) {
        if (pool.poolId == null || pool.poolId === '') continue;
        byPool.set(String(pool.poolId), unitsFromNexaPoolAndPlan(pool, plan));
        pairs.push({ plan, pool });
      }
    } else {
      const live = unitsFromNexaPoolAndPlan(null, plan);
      byPool.set(`plan:${plan.planId}`, live);
      pairs.push({ plan, pool: null });
    }
  }
  return { byPool, pairs };
}

function resolveLiveForStock(stock, nexaCfg, byPool, plans) {
  const poolId = nexaCfg.poolId;
  if (poolId != null && poolId !== '') {
    const hit = byPool.get(String(poolId));
    if (hit) return hit;
  }
  const planId = Number(nexaCfg.planId);
  const subnet = normalizeSubnet(nexaCfg.subnet);
  if (!planId) return { available: false, stockCount: 0 };
  const plan = plans.find((p) => Number(p.planId) === planId);
  if (!plan) return byPool.get(`plan:${planId}`) || { available: false, stockCount: 0 };
  if (subnet && plan.pools?.length) {
    const pool = plan.pools.find((p) => subnetsMatch(p.subnet, subnet));
    if (pool) return unitsFromNexaPoolAndPlan(pool, plan);
  }
  return byPool.get(`plan:${planId}`) || unitsFromNexaPoolAndPlan(null, plan);
}

function defaultNexaMemoryOptions(price) {
  return { IP: { price: Math.max(0, Math.round(Number(price) || 0)) } };
}

function buildNexaStockDocument(companyId, plan, pool, live) {
  const planId = Number(plan.planId);
  const price = nexaStoreSellPrice(pool, plan);
  const protocol = NexaApi.normalizeOrderProtocol(
    (plan.protocols || []).includes('SOCKS5')
      ? 'SOCKS5'
      : ((plan.protocols || [])[0] || plan.protocol || 'SOCKS5')
  );
  const units = live?.stockCount ?? stockUnits(pool?.stock ?? plan.stock, pool ? pool.inStock !== false : plan.inStock !== false);
  const inStock = live?.available ?? units > 0;
  return {
    name: buildNexaStockName(plan, pool),
    description: '',
    available: inStock,
    stockCount: inStock ? Math.max(units, live?.stockCount || 1) : 0,
    hiddenFromStore: !inStock,
    autoHiddenFromStore: !inStock,
    company: companyId,
    serverType: 'Proxy',
    tags: ['nexa'],
    memoryOptions: defaultNexaMemoryOptions(price),
    promoCodes: [{ code: 'OCEAN50', discount: 50, discountType: 'fixed', isActive: true }],
    defaultConfigurations: {
      nexa: {
        planId,
        poolId: pool?.poolId != null ? Number(pool.poolId) : null,
        protocol,
        tier: plan.tier || '',
        controlMode: plan.controlMode || '',
        subnet: pool?.subnet || plan.subnet || '',
        regularPrice: price,
        apiPrice: Number(pool?.apiPrice ?? plan.apiPrice) || 0,
        nexaAutoSynced: true,
      },
    },
  };
}

module.exports = {
  mapPool,
  mapPlan,
  mapPlansPayload,
  nexaStoreSellPrice,
  stockUnits,
  unitsFromNexaPoolAndPlan,
  unitsFromPoolRaw,
  nexaStockKey,
  buildNexaStockName,
  buildPoolStockMapFromPlans,
  resolveLiveForStock,
  defaultNexaMemoryOptions,
  buildNexaStockDocument,
  normalizeSubnet,
  subnetsMatch,
};
