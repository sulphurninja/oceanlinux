const connectDB = require('../src/lib/db').default;
const IPStock = require('../src/models/ipStockModel');
const { buildSmartVpsBlockFromPackage } = require('../src/lib/smartvpsPackageRam');
const SmartVpsAPI = require('../src/services/smartvpsApi');

function toPlainMap(m) {
  if (!m) return {};
  if (typeof m.forEach === 'function' && typeof m.get === 'function' && !Array.isArray(m)) {
    const plain = {};
    m.forEach((entry, key) => {
      plain[key] = entry;
    });
    return plain;
  }
  if (m instanceof Map) return Object.fromEntries(m);
  if (typeof m.toObject === 'function') {
    try {
      return m.toObject({ flattenMaps: true, minimize: false });
    } catch {
      return m.toObject({ minimize: true });
    }
  }
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
    const existingMemory = toPlainMap(existing.memoryOptions);
    const { memoryOptions, smartvpsBlock } = buildSmartVpsBlockFromPackage(
      pkg,
      existingDefaults.smartvps || {},
      existingMemory
    );

    await IPStock.findByIdAndUpdate(existing._id, {
      memoryOptions,
      defaultConfigurations: { ...existingDefaults, smartvps: smartvpsBlock },
    });
    updated++;
    if (pkg.name === '103.83.x') {
      console.log('103.83.x =>', Object.keys(memoryOptions), 'allowed', smartvpsBlock.allowedRams);
    }
  }

  console.log(`Synced ${updated} ocean products`);
  process.exit(0);
})();
