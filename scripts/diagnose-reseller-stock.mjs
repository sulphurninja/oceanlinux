import fs from 'node:fs';
import mongoose from 'mongoose';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const uri = (process.env.MONGOOSE_URL || '').trim().replace(/^["']|["']$/g, '');
await mongoose.connect(uri);

const Reseller = mongoose.connection.collection('resellers');
const IPStock = mongoose.connection.collection('ipstocks');
const SlotIP = mongoose.connection.collection('slotippackages');

const reseller = await Reseller.findOne({ apiKey: { $exists: true, $ne: null }, status: 'active' });
if (!reseller) {
  console.error('No active reseller');
  process.exit(1);
}

const H = { 'x-api-key': reseller.apiKey, 'x-api-secret': reseller.apiSecret };

async function api(path) {
  const res = await fetch(`http://localhost:3000/api/v1/reseller${path}`, { headers: H });
  return res.json();
}

const total = await IPStock.countDocuments({});
const visible = await IPStock.countDocuments({ hiddenFromStore: { $ne: true } });
const hidden = await IPStock.countDocuments({ hiddenFromStore: true });
const availableTrue = await IPStock.countDocuments({ hiddenFromStore: { $ne: true }, available: true });
const availableFalse = await IPStock.countDocuments({ hiddenFromStore: { $ne: true }, available: false });
const availableUnset = await IPStock.countDocuments({
  hiddenFromStore: { $ne: true },
  $or: [{ available: { $exists: false } }, { available: null }],
});

const slotTotal = await SlotIP.countDocuments({});
const slotVisible = await SlotIP.countDocuments({ available: { $ne: false } });
const slotDisabled = await SlotIP.countDocuments({ available: false });

console.log('\n=== DATABASE ===');
console.log(`IPStock total:              ${total}`);
console.log(`IPStock visible (not hidden): ${visible}`);
console.log(`IPStock hiddenFromStore:    ${hidden}`);
console.log(`  available=true:           ${availableTrue}`);
console.log(`  available=false:          ${availableFalse}`);
console.log(`  available unset/null:     ${availableUnset}`);
console.log(`SlotIP total:               ${slotTotal}`);
console.log(`SlotIP visible:             ${slotVisible}`);
console.log(`SlotIP disabled:            ${slotDisabled}`);
console.log(`Expected catalogue max:     ${visible + slotVisible}`);

const def = await api('/products');
const full = await api('/products?includeOutOfStock=1');

console.log('\n=== API (default) ===');
console.log(`count:           ${def.count}`);
console.log(`inStockCount:    ${def.inStockCount}`);
console.log(`outOfStockCount: ${def.outOfStockCount}`);
console.log(`vpsCount:        ${def.vpsCount}`);
console.log(`slotIpCount:     ${def.slotIpCount}`);

console.log('\n=== API (?includeOutOfStock=1) ===');
console.log(`count:           ${full.count}`);
console.log(`inStockCount:    ${full.inStockCount}`);
console.log(`outOfStockCount: ${full.outOfStockCount}`);

const emptyMem = (full.products || []).filter(
  (p) => !p.memoryOptions || !Object.keys(p.memoryOptions).length,
);
console.log(`\nProducts with EMPTY memoryOptions: ${emptyMem.length}`);
if (emptyMem.length) {
  console.log('Sample:', emptyMem.slice(0, 5).map((p) => ({ name: p.name, type: p.productType, available: p.available, inStock: p.inStock })));
}

const oos = (full.products || []).filter((p) => !p.inStock);
console.log(`\nOut-of-stock samples (first 5):`);
for (const p of oos.slice(0, 5)) {
  console.log(`  - ${p.name} (${p.productType}) available=${p.available}`);
}

const slots = await SlotIP.find({}).toArray();
console.log('\n=== SLOT IP PACKAGES ===');
for (const s of slots) {
  const free = (s.ips || []).filter((i) => !i.allocated).length;
  console.log(`  ${s.name} | available=${s.available} | free=${free}/${(s.ips || []).length}`);
}

const inStockSlots = (full.products || []).filter((p) => p.productType === 'slotip' && p.inStock);
const oosSlots = (full.products || []).filter((p) => p.productType === 'slotip' && !p.inStock);
console.log(`Slot in stock via API: ${inStockSlots.length}, out of stock: ${oosSlots.length}`);

console.log(`\n=== WHY DEFAULT SHOWS LESS ===`);
console.log(`DB visible plans:     ${visible + slotVisible}`);
console.log(`API all (with OOS):   ${full.count}`);
console.log(`API default (in-stock only): ${def.count}`);
console.log(`Hidden by default filter:    ${full.count - def.count} sold-out plans`);

await mongoose.disconnect();
