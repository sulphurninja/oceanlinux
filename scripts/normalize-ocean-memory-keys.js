const connectDB = require('../src/lib/db').default;
const IPStock = require('../src/models/ipStockModel');
const { normalizeMemoryTierKey, toPlainMemoryOptions } = require('../src/lib/smartvpsPackageRam');

(async () => {
  await connectDB();
  const stocks = await IPStock.find({ name: /^🌊 / });
  let updated = 0;

  for (const stock of stocks) {
    const existing = toPlainMemoryOptions(stock.memoryOptions);
    const normalized = {};
    let changed = false;

    for (const [key, value] of Object.entries(existing)) {
      const cleanKey = normalizeMemoryTierKey(key);
      if (cleanKey !== key) changed = true;
      if (!normalized[cleanKey] || Number(value?.price) > Number(normalized[cleanKey]?.price)) {
        normalized[cleanKey] = value;
      }
    }

    if (!changed) continue;
    await IPStock.findByIdAndUpdate(stock._id, { memoryOptions: normalized });
    updated++;
    console.log(stock.name, '=>', Object.keys(normalized));
  }

  console.log(`Normalized ${updated} ocean products`);
  process.exit(0);
})();
