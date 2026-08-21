require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MEMORY_TIER_ORDER = ['1GB', '2GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB'];

function normalizeMemoryKey(memory) {
  const raw = String(memory || '').trim();
  const m = raw.match(/(\d+)\s*GB/i);
  if (m) return `${m[1]}GB`;
  return raw;
}

function memoryTierSortIndex(label) {
  const normalized = normalizeMemoryKey(label);
  const idx = MEMORY_TIER_ORDER.indexOf(normalized);
  if (idx !== -1) return idx;
  const gb = normalized.match(/^(\d+)GB$/i);
  if (gb) return 1000 + Number(gb[1]);
  return 9999;
}

function sortKeys(keys, useOldSort = false) {
  const entries = keys.map((k) => [k, { price: 1 }]);
  if (useOldSort) {
    return [...entries]
      .sort((a, b) => {
        const ai = MEMORY_TIER_ORDER.indexOf(a[0]);
        const bi = MEMORY_TIER_ORDER.indexOf(b[0]);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
      })
      .map(([k]) => k);
  }
  return [...entries]
    .sort((a, b) => memoryTierSortIndex(a[0]) - memoryTierSortIndex(b[0]))
    .map(([k]) => k);
}

function hasNonCanonicalKeys(keys) {
  return keys.some((k) => k !== normalizeMemoryKey(k));
}

function oldSortWrong(keys) {
  const oldOrder = sortKeys(keys, true);
  const newOrder = sortKeys(keys, false);
  return oldOrder.join('|') !== newOrder.join('|');
}

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const stocks = await mongoose.connection.db
    .collection('ipstocks')
    .find({ hiddenFromStore: { $ne: true } })
    .project({ name: 1, memoryOptions: 1, available: 1 })
    .toArray();

  const affected = [];
  const nonCanonicalOnly = [];

  for (const stock of stocks) {
    const opts = stock.memoryOptions || {};
    const keys = Object.keys(opts).filter(
      (k) => k && !String(k).startsWith('$') && opts[k]?.price != null && Number(opts[k].price) > 0
    );
    if (keys.length < 2) continue;

    const nonCanonical = hasNonCanonicalKeys(keys);
    const wrong = oldSortWrong(keys);

    if (nonCanonical) {
      nonCanonicalOnly.push({
        id: String(stock._id),
        name: stock.name,
        keys,
        oldOrder: sortKeys(keys, true),
        newOrder: sortKeys(keys, false),
      });
    }

    if (wrong) {
      affected.push({
        id: String(stock._id),
        name: stock.name,
        keys,
        oldFirst: sortKeys(keys, true)[0],
        newFirst: sortKeys(keys, false)[0],
        oldOrder: sortKeys(keys, true),
        newOrder: sortKeys(keys, false),
      });
    }
  }

  console.log('=== MEMORY KEY AUDIT ===');
  console.log('Total visible stocks:', stocks.length);
  console.log('Stocks with 2+ priced tiers:', nonCanonicalOnly.length + (affected.length - new Set(affected.map((a) => a.id)).size));
  console.log('Non-canonical keys (e.g. "4GB Linux"):', nonCanonicalOnly.length);
  console.log('OLD sort wrong (32GB/exact-only first):', affected.length);

  console.log('\n=== AFFECTED STOCKS (old sort ≠ new sort) ===');
  for (const row of affected) {
    console.log(JSON.stringify({
      name: row.name,
      wasFirst: row.oldFirst,
      nowFirst: row.newFirst,
      oldOrder: row.oldOrder,
      newOrder: row.newOrder,
    }));
  }

  if (affected.length === 0) {
    console.log('None — all stocks already sort correctly with the fix.');
  }

  await mongoose.disconnect();
})();
