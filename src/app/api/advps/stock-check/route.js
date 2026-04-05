import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
const {
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  toPlainConfigurations,
} = require('@/lib/advpsLiveStock');

/**
 * Refresh ADVPS-backed IPStock rows from api.advps.org (all pages) and set `available` from live stock.
 * Safe to call from EventBridge/cron/Lambda every minute.
 */
async function runAdvpsStockCheck() {
  await connectDB();
  const entries = await IPStock.find({ name: /^⚡/ });
  const advpsBlocks = entries
    .map((doc) => toPlainConfigurations(doc.defaultConfigurations)?.advps)
    .filter(Boolean);
  const stockMap = await fetchAdvpsStockMap(advpsBlocks);

  let refreshed = 0;
  let availabilityFlips = 0;

  for (const doc of entries) {
    const defaults = toPlainConfigurations(doc.defaultConfigurations);
    const advps = defaults?.advps;
    if (!advps) continue;

    const advpsLive = JSON.parse(JSON.stringify(advps));
    const hasStock = applyStockMapToAdvpsBlock(advpsLive, stockMap);

    if (doc.available !== hasStock) availabilityFlips += 1;

    await IPStock.findByIdAndUpdate(doc._id, {
      available: hasStock,
      defaultConfigurations: { ...defaults, advps: advpsLive },
    });
    refreshed += 1;
  }

  const productsFromApi = Object.keys(stockMap).length;

  return {
    success: true,
    productsFromApi,
    advpsRowsByName: entries.length,
    refreshed,
    availabilityFlips,
  };
}

export async function GET() {
  try {
    const body = await runAdvpsStockCheck();
    return NextResponse.json(body);
  } catch (error) {
    console.error('[ADVPS-STOCK-CHECK] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message, refreshed: 0, availabilityFlips: 0 },
      { status: 500 }
    );
  }
}

/** Same as GET — use from Lambda if you prefer POST like other cron routes. */
export async function POST() {
  return GET();
}
