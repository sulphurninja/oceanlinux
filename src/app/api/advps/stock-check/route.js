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

export async function GET() {
  try {
    await connectDB();
    const api = new AdvpsAPI();

    const [linuxRes, vpsRes] = await Promise.all([
      api.productStock({ type: 'linux' }),
      api.productStock({ type: 'vps' }),
    ]);

    const allProducts = [
      ...(linuxRes?.data?.stock || []),
      ...(vpsRes?.data?.stock || []),
    ];

    // Build a map of productId → stock info
    const stockMap = {};
    for (const p of allProducts) {
      stockMap[String(p.id)] = {
        stock: Number(p.stock || 0),
        stockStatus: p.stockStatus,
      };
    }

    // Fetch all ADVPS entries from our DB
    const advpsEntries = await IPStock.find({ tags: 'flex', name: /^⚡ / });
    let updated = 0;

    for (const doc of advpsEntries) {
      const defaults = toPlainMap(doc.defaultConfigurations);
      const advps = defaults?.advps;
      if (!advps) continue;

      // Check stock across all variants (if grouped) or single product
      let hasStock = false;

      if (advps.variants && typeof advps.variants === 'object') {
        for (const [, variant] of Object.entries(advps.variants)) {
          const pid = variant.productId;
          if (pid && stockMap[pid]) {
            const s = stockMap[pid];
            variant.stock = s.stock;
            variant.stockStatus = s.stockStatus;
            if (s.stock > 0 && s.stockStatus !== 'OUT_OF_STOCK') hasStock = true;
          }
        }
      } else if (advps.productId && stockMap[advps.productId]) {
        const s = stockMap[advps.productId];
        advps.availableStock = s.stock;
        advps.stockStatus = s.stockStatus;
        if (s.stock > 0 && s.stockStatus !== 'OUT_OF_STOCK') hasStock = true;
      }

      if (doc.available !== hasStock) {
        await IPStock.findByIdAndUpdate(doc._id, {
          available: hasStock,
          defaultConfigurations: { ...defaults, advps },
        });
        updated++;
      }
    }

    return NextResponse.json({ success: true, checked: advpsEntries.length, updated });
  } catch (error) {
    console.error('[ADVPS-STOCK-CHECK] Error:', error.message);
    return NextResponse.json({ success: true, checked: 0, updated: 0 });
  }
}
