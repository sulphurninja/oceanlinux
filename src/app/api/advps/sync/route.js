import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
const AdvpsAPI = require('@/services/advpsApi');

function toPlainMap(maybeMap) {
  if (!maybeMap) return {};
  if (typeof maybeMap.toObject === 'function') return maybeMap.toObject({ minimize: true });
  if (maybeMap instanceof Map) return Object.fromEntries(maybeMap);
  return { ...maybeMap };
}

function extractRam(str) {
  const m = str.match(/(\d+)\s*GB/i);
  return m ? `${m[1]}GB` : null;
}

function getBaseName(name) {
  return name.replace(/\s*\d+\s*GB\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

const defaultPricing = {
  '1GB': 199, '2GB': 299, '4GB': 699, '6GB': 899,
  '8GB': 999, '12GB': 1299, '16GB': 1499, '32GB': 2999,
};

async function runSync() {
  const started = Date.now();
  console.log('\n[ADVPS-SYNC] Starting sync...');

  await connectDB();
  const api = new AdvpsAPI();

  const [linuxProducts, vpsProducts] = await Promise.all([
    api.productStockAll({ type: 'linux' }),
    api.productStockAll({ type: 'vps' }),
  ]);
  const allProducts = [...linuxProducts, ...vpsProducts];

  const seen = new Set();
  const deduped = allProducts.filter(p => {
    const id = String(p.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  console.log(`[ADVPS-SYNC] Products from API: linux=${linuxProducts.length}, vps=${vpsProducts.length}, deduped=${deduped.length}`);

  // Group products by base name (strip RAM from name)
  // e.g. "Linux VPS 2GB", "Linux VPS 4GB", "Linux VPS 8GB" → group "Linux VPS"
  const groups = {};

  for (const product of deduped) {
    const name = String(product.name);
    const packName = product.packName || name;
    const ram = extractRam(name) || extractRam(packName);
    const baseName = getBaseName(name) || name;

    if (!groups[baseName]) {
      groups[baseName] = {
        baseName,
        vmType: product.vmType,
        variants: [],
      };
    }

    groups[baseName].variants.push({
      pid: String(product.id),
      name,
      packName,
      ram: ram || '4GB',
      stock: Number(product.stock || 0),
      stockStatus: product.stockStatus,
    });
  }

  console.log(`[ADVPS-SYNC] Grouped into ${Object.keys(groups).length} base products`);

  let created = 0, updated = 0, disabled = 0;
  const results = [];
  const activeBaseNames = new Set();

  for (const [baseName, group] of Object.entries(groups)) {
    activeBaseNames.add(baseName);

    const isVPS = group.vmType === 'VM';
    const serverType = isVPS ? 'VPS' : 'Linux';
    const namePrefix = `⚡ ${baseName}`;
    const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const hasAnyStock = group.variants.some(v => v.stock > 0 && v.stockStatus !== 'OUT_OF_STOCK');

    // Build memory options from all variants
    const memoryOptions = {};
    const advpsVariants = {};
    for (const v of group.variants) {
      memoryOptions[v.ram] = {
        price: defaultPricing[v.ram] || 699,
        hostycareProductId: null,
        hostycareProductName: null,
      };
      advpsVariants[v.ram] = {
        productId: v.pid,
        productName: v.name,
        packName: v.packName,
        stock: v.stock,
        stockStatus: v.stockStatus,
      };
    }

    const advpsBlock = {
      provider: 'advps',
      baseName,
      vmType: group.vmType,
      variants: advpsVariants,
    };

    let existing = await IPStock.findOne({
      name: { $regex: new RegExp(`^⚡ ${escapedBase}(\\s|$)`, 'i') }
    });

    if (existing) {
      const existingDefaults = toPlainMap(existing.defaultConfigurations);
      const existingMemory = toPlainMap(existing.memoryOptions);

      // Merge new memory options into existing (don't overwrite admin-set prices)
      for (const [ram, opts] of Object.entries(memoryOptions)) {
        if (!existingMemory[ram]) {
          existingMemory[ram] = opts;
        }
      }

      await IPStock.findByIdAndUpdate(existing._id, {
        available: hasAnyStock,
        memoryOptions: existingMemory,
        defaultConfigurations: { ...existingDefaults, advps: advpsBlock },
      });

      updated++;
      console.log(`[ADVPS-SYNC] Updated: ${existing.name} - ${group.variants.length} RAM options, available: ${hasAnyStock}`);
      results.push({ action: 'updated', id: existing._id.toString(), name: existing.name, variants: group.variants.length, available: hasAnyStock });
    } else {
      const defaultPromoCodes = [
        { code: 'OCEAN50', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
      ];

      const newDoc = await IPStock.create({
        name: namePrefix,
        description: `ADVPS ${serverType} — ${group.variants.map(v => v.ram).join(', ')}`,
        available: hasAnyStock,
        serverType,
        tags: ['flex'],
        memoryOptions,
        promoCodes: defaultPromoCodes,
        defaultConfigurations: { advps: advpsBlock },
      });

      created++;
      console.log(`[ADVPS-SYNC] Created: ${namePrefix} — ${group.variants.map(v => v.ram).join(', ')}`);
      results.push({ action: 'created', id: newDoc._id.toString(), name: namePrefix, variants: group.variants.length, available: hasAnyStock });
    }
  }

  // Disable ADVPS entries no longer returned by API (name prefix is the source of truth)
  const allAdvpsEntries = await IPStock.find({ name: /^⚡/ });

  for (const doc of allAdvpsEntries) {
    const docBaseName = doc.name.replace(/^⚡ /, '').trim();
    if (!activeBaseNames.has(docBaseName) && doc.available) {
      await IPStock.findByIdAndUpdate(doc._id, { available: false });
      disabled++;
      console.log(`[ADVPS-SYNC] Disabled (not in API): ${doc.name}`);
      results.push({ action: 'disabled', id: doc._id.toString(), name: doc.name, reason: 'not_in_api_response' });
    }
  }

  const tookMs = Date.now() - started;
  console.log(`[ADVPS-SYNC] Done: created=${created}, updated=${updated}, disabled=${disabled}, took=${tookMs}ms`);

  return NextResponse.json({
    success: true,
    summary: { created, updated, disabled, tookMs, productsInAPI: deduped.length, groups: Object.keys(groups).length },
    results,
  });
}

export async function GET() {
  try { return await runSync(); }
  catch (e) {
    console.error('[ADVPS-SYNC GET] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST() {
  try { return await runSync(); }
  catch (e) {
    console.error('[ADVPS-SYNC POST] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
