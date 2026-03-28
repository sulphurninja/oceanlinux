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

async function runSync() {
  const started = Date.now();
  console.log('\n[ADVPS-SYNC] Starting sync...');

  await connectDB();

  const api = new AdvpsAPI();

  const linuxRes = await api.productStock({ type: 'linux' });
  const vpsRes = await api.productStock({ type: 'vps' });

  const linuxProducts = linuxRes?.data?.stock || [];
  const vpsProducts = vpsRes?.data?.stock || [];
  const allProducts = [...linuxProducts, ...vpsProducts];

  const seen = new Set();
  const deduped = allProducts.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  console.log(`[ADVPS-SYNC] Products from API: linux=${linuxProducts.length}, vps=${vpsProducts.length}, deduped=${deduped.length}`);

  const activeIds = new Set();
  let created = 0, updated = 0, disabled = 0;
  const results = [];

  const defaultPricing = { '2GB': 299, '4GB': 699, '8GB': 999, '16GB': 1499 };

  for (const product of deduped) {
    const pid = String(product.id);
    const name = String(product.name);
    const packName = product.packName || name;
    const stock = Number(product.stock || 0);
    const isAvailable = stock > 0 && product.stockStatus !== 'OUT_OF_STOCK';
    const isVPS = product.vmType === 'VM';
    const serverType = isVPS ? 'VPS' : 'Linux';

    activeIds.add(pid);

    const namePrefix = `⚡ ${name}`;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let existing = await IPStock.findOne({
      name: { $regex: new RegExp(`^⚡ ${escapedName}(\\s|$)`, 'i') }
    });

    const advpsBlock = {
      provider: 'advps',
      productId: pid,
      productName: name,
      packName,
      vmType: product.vmType,
      availableStock: stock,
      stockStatus: product.stockStatus,
    };

    if (existing) {
      const existingDefaults = toPlainMap(existing.defaultConfigurations);

      await IPStock.findByIdAndUpdate(existing._id, {
        available: isAvailable,
        defaultConfigurations: {
          ...existingDefaults,
          advps: advpsBlock,
        },
      });

      updated++;
      console.log(`[ADVPS-SYNC] Updated: ${existing.name} - available: ${isAvailable}, stock: ${stock}`);
      results.push({ action: 'updated', id: existing._id.toString(), name: existing.name, stock, available: isAvailable });
    } else {
      const ramMatch = name.match(/(\d+)\s*GB/i);
      const detectedRam = ramMatch ? `${ramMatch[1]}GB` : '4GB';
      const price = defaultPricing[detectedRam] || 699;

      const memoryOptions = {
        [detectedRam]: { price, hostycareProductId: null, hostycareProductName: null },
      };

      const defaultPromoCodes = [
        { code: 'OCEAN50', discount: 50, discountType: 'fixed', isActive: true, createdAt: new Date() },
      ];

      const newDoc = await IPStock.create({
        name: namePrefix,
        description: `ADVPS ${serverType} — ${packName}`,
        available: isAvailable,
        serverType,
        tags: ['flex'],
        memoryOptions,
        promoCodes: defaultPromoCodes,
        defaultConfigurations: { advps: advpsBlock },
      });

      created++;
      console.log(`[ADVPS-SYNC] Created: ${namePrefix}`);
      results.push({ action: 'created', id: newDoc._id.toString(), name: namePrefix, stock, available: isAvailable });
    }
  }

  const allAdvpsEntries = await IPStock.find({ tags: 'flex', name: /^⚡ / });

  for (const doc of allAdvpsEntries) {
    const existingDefaults = toPlainMap(doc.defaultConfigurations);
    const pid = existingDefaults?.advps?.productId;
    if (pid && !activeIds.has(pid) && doc.available) {
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
    summary: { created, updated, disabled, tookMs, productsInAPI: deduped.length },
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
