import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
const {
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  toPlainConfigurations,
  cloneAdvpsForMutation,
  deepMapToPlain,
} = require('@/lib/advpsLiveStock');

const LOG = '[ADVPS-STOCK-CHECK]';

/**
 * Refresh live stock counts on existing ⚡ ADVPS IPStock rows from api.advps.org.
 */
export async function runAdvpsStockCheck() {
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
    let defaults = toPlainConfigurations(doc.defaultConfigurations);
    let advpsRaw = defaults?.advps;

    if (advpsRaw == null && typeof doc.toObject === 'function') {
      try {
        const loose = doc.toObject({ flattenMaps: true, minimize: false });
        const dc = loose.defaultConfigurations;
        if (dc && typeof dc === 'object' && dc.advps != null) {
          advpsRaw = deepMapToPlain(dc.advps);
          defaults = { ...defaults, advps: advpsRaw };
          console.warn(`${LOG} recovered advps via doc.toObject fallback`, {
            runId,
            ipStockId: String(doc._id),
            name: doc.name,
          });
        }
      } catch (e) {
        console.warn(`${LOG} doc.toObject fallback failed`, { name: doc.name, err: e.message });
      }
    }

    if (!advpsRaw) {
      missingAdvpsBlock += 1;
      continue;
    }

    const advpsLive = cloneAdvpsForMutation(advpsRaw);
    if (!advpsLive) {
      missingAdvpsBlock += 1;
      continue;
    }

    const hasStock = applyStockMapToAdvpsBlock(advpsLive, stockMap, {
      verbose: true,
      label: doc.name,
      ipStockId: doc._id,
    });

    if (doc.available !== hasStock && !doc.availabilityManual) {
      availabilityFlips += 1;
    }

    const updatePayload = {
      defaultConfigurations: { ...defaults, advps: advpsLive },
    };
    if (!doc.availabilityManual) {
      updatePayload.available = hasStock;
    }

    await IPStock.findByIdAndUpdate(doc._id, updatePayload);
    refreshed += 1;
  }

  const tookMs = Date.now() - t0;
  const summary = {
    success: true,
    runId,
    tookMs,
    productsFromApi: Object.keys(stockMap).length,
    advpsRowsByName: entries.length,
    refreshed,
    availabilityFlips,
    missingAdvpsBlock,
  };

  console.log(`${LOG} === run complete`, summary);
  return summary;
}
