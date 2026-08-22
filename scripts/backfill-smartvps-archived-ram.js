/**
 * Backfill archivedMemoryOptions for Ocean SmartVPS products where RAM tiers
 * were deleted before the archive feature existed (e.g. 103.109.18x 8GB).
 *
 * Usage: node scripts/backfill-smartvps-archived-ram.js
 */
const connectDB = require('../src/lib/db').default;
const IPStock = require('../src/models/ipStockModel');
const SmartVpsAPI = require('../src/services/smartvpsApi');
const {
  buildSmartVpsBlockFromPackage,
  toPlainMemoryOptions,
} = require('../src/lib/smartvpsPackageRam');

function toPlainMap(m) {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  if (typeof m.toObject === 'function') return m.toObject({ minimize: true });
  return { ...m };
}

function normalize(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
  return payload;
}

(async () => {
  await connectDB();
  const api = new SmartVpsAPI();
  const raw = await api.ipstock();
  const obj = normalize(raw);
  const packages = obj.packages || [];
  let updated = 0;

  for (const pkg of packages) {
    const escaped = String(pkg.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await IPStock.findOne({
      name: { $regex: new RegExp(`^🌊 ${escaped}(\\s|$)`, 'i') },
    });
    if (!existing) continue;

    const existingDefaults = toPlainMap(existing.defaultConfigurations);
    const existingMemory = toPlainMemoryOptions(existing.memoryOptions);
    const { memoryOptions, smartvpsBlock } = buildSmartVpsBlockFromPackage(
      pkg,
      existingDefaults.smartvps || {},
      existingMemory
    );

    const prevArchived = JSON.stringify(existingDefaults.smartvps?.archivedMemoryOptions || {});
    const nextArchived = JSON.stringify(smartvpsBlock.archivedMemoryOptions || {});
    if (prevArchived === nextArchived && JSON.stringify(existingMemory) === JSON.stringify(memoryOptions)) {
      continue;
    }

    await IPStock.findByIdAndUpdate(existing._id, {
      memoryOptions,
      defaultConfigurations: { ...existingDefaults, smartvps: smartvpsBlock },
    });
    updated++;
    console.log(
      `[backfill] ${existing.name} => active: ${Object.keys(memoryOptions).join(', ') || 'none'} | archived: ${Object.keys(smartvpsBlock.archivedMemoryOptions || {}).join(', ') || 'none'}`
    );
  }

  console.log(`Backfilled ${updated} ocean product(s)`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
