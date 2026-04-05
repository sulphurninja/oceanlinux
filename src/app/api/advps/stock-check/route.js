import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
const {
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  toPlainConfigurations,
  cloneAdvpsForMutation,
} = require('@/lib/advpsLiveStock');

const LOG = '[ADVPS-STOCK-CHECK]';

/**
 * Refresh ADVPS-backed IPStock rows from api.advps.org (all pages) and set `available` from live stock.
 * Safe to call from EventBridge/cron/Lambda every minute.
 */
async function runAdvpsStockCheck() {
  const runId = `${Date.now().toString(36)}`;
  const t0 = Date.now();
  console.log(`${LOG} === run start`, { runId });

  await connectDB();
  const entries = await IPStock.find({ name: /^⚡/ });
  console.log(`${LOG} matched IPStock by name /^⚡/`, { count: entries.length, runId });

  const advpsBlocks = entries
    .map((doc) => toPlainConfigurations(doc.defaultConfigurations)?.advps)
    .filter(Boolean);
  console.log(`${LOG} advps blocks collected for map fetch`, {
    runId,
    blocksWithAdvps: advpsBlocks.length,
    rowsWithoutAdvps: entries.length - advpsBlocks.length,
  });

  const stockMap = await fetchAdvpsStockMap(advpsBlocks, { verbose: true });

  let refreshed = 0;
  let availabilityFlips = 0;
  let missingAdvpsBlock = 0;

  for (const doc of entries) {
    const defaults = toPlainConfigurations(doc.defaultConfigurations);
    const advpsRaw = defaults?.advps;
    if (!advpsRaw) {
      missingAdvpsBlock += 1;
      console.warn(`${LOG} skip: no advps in defaultConfigurations`, {
        runId,
        ipStockId: String(doc._id),
        name: doc.name,
        availableBefore: doc.available,
      });
      continue;
    }

    const advpsLive = cloneAdvpsForMutation(advpsRaw);
    if (!advpsLive) {
      missingAdvpsBlock += 1;
      console.warn(`${LOG} skip: cloneAdvpsForMutation returned null`, {
        runId,
        ipStockId: String(doc._id),
        name: doc.name,
      });
      continue;
    }

    const hasStock = applyStockMapToAdvpsBlock(advpsLive, stockMap, {
      verbose: true,
      label: doc.name,
      ipStockId: doc._id,
    });

    if (doc.available !== hasStock) {
      availabilityFlips += 1;
      console.log(`${LOG} availability change`, {
        runId,
        ipStockId: String(doc._id),
        name: doc.name,
        before: doc.available,
        after: hasStock,
      });
    }

    await IPStock.findByIdAndUpdate(doc._id, {
      available: hasStock,
      defaultConfigurations: { ...defaults, advps: advpsLive },
    });
    refreshed += 1;
  }

  const productsFromApi = Object.keys(stockMap).length;
  const tookMs = Date.now() - t0;

  const summary = {
    success: true,
    runId,
    tookMs,
    productsFromApi,
    advpsRowsByName: entries.length,
    refreshed,
    availabilityFlips,
    missingAdvpsBlock,
  };

  console.log(`${LOG} === run complete`, summary);
  return summary;
}

export async function GET() {
  try {
    const body = await runAdvpsStockCheck();
    return NextResponse.json(body);
  } catch (error) {
    console.error('[ADVPS-STOCK-CHECK] fatal:', error.message, error.stack);
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
