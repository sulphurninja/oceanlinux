require('dotenv').config();
const mongoose = require('mongoose');

// Minimal copies of logic under test
function readCompanyConfig(stock) {
  let cfg = stock?.defaultConfigurations?.company;
  if (!cfg && typeof stock?.defaultConfigurations?.get === 'function') {
    cfg = stock.defaultConfigurations.get('company');
  }
  return cfg && typeof cfg === 'object' ? cfg : {};
}

function usesPreconfiguredInventory(stock) {
  return !!(stock?.company && Array.isArray(stock.inventoryItems) && stock.inventoryItems.length > 0);
}

function getCompanyFulfillmentMode(stock) {
  const mode = readCompanyConfig(stock).fulfillmentMode;
  if (mode === 'units' || mode === 'inventory') return mode;
  return usesPreconfiguredInventory(stock) ? 'inventory' : 'units';
}

function usesCompanyInventoryFulfillment(stock) {
  return !!(stock?.company && getCompanyFulfillmentMode(stock) === 'inventory');
}

function usesCompanyUnitFulfillment(stock) {
  return !!(stock?.company && getCompanyFulfillmentMode(stock) === 'units');
}

function countUnallocatedInventory(stock) {
  if (!Array.isArray(stock?.inventoryItems)) return 0;
  return stock.inventoryItems.filter((i) => !i.allocated).length;
}

function stockHasNetbayPlans(stock) {
  const cfg = stock?.defaultConfigurations?.netbay;
  const plans = cfg?.planByMemory;
  if (!plans) return false;
  const obj = plans instanceof Map ? Object.fromEntries(plans) : plans;
  return Object.values(obj || {}).some(Boolean);
}

function stockHasResellerPanelPlans(stock) {
  let cfg = stock?.defaultConfigurations?.resellerApi;
  if (cfg && typeof cfg === 'object') return true;
  const tags = (stock?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('reseller-api') || tags.includes('primevps') || tags.includes('primevm');
}

function usesResellerLiveStock(stock, company) {
  if (!stockHasResellerPanelPlans(stock)) return false;
  if (!company?.resellerApi?.enabled) return false;
  return company.resellerApi.useLiveStockApi === true;
}

function usesNetbayLiveStock(stock, company) {
  if (!stockHasNetbayPlans(stock)) return false;
  if (!company?.netbayApi?.enabled) return false;
  return company.netbayApi.useLiveStockApi === true;
}

function usesStockCount(stock, company) {
  if (usesCompanyUnitFulfillment(stock)) return true;
  if (usesNetbayLiveStock(stock, company)) return false;
  if (usesResellerLiveStock(stock, company)) return false;
  return !!(stock?.company);
}

function getIpStockRemaining(stock, company) {
  if (!stock) return 0;
  if (usesCompanyInventoryFulfillment(stock)) {
    return countUnallocatedInventory(stock);
  }
  if (usesStockCount(stock, company)) {
    return Math.max(0, Number(stock.stockCount) || 0);
  }
  return stock.available ? Number.POSITIVE_INFINITY : 0;
}

async function main() {
  const uri = (process.env.MONGOOSE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const company = await db.collection('companies').findOne({ slug: 'primevps' });
  const companyDoc = company;
  const stocks = await db.collection('ipstocks').find({ company: company._id }).toArray();

  console.log('Serialize test for', stocks.length, 'stocks');
  for (const stock of stocks) {
    try {
      const remaining = getIpStockRemaining(stock, companyDoc);
      const uses = usesStockCount(stock, companyDoc);
      console.log('OK', stock.name.slice(0, 40), 'remaining=', remaining, 'usesStockCount=', uses);
    } catch (err) {
      console.log('FAIL', stock._id, stock.name, err.message);
    }
  }

  // Test session id string query
  const idStr = company._id.toString();
  const byStr = await db.collection('ipstocks').countDocuments({ company: idStr });
  const byObj = await db.collection('ipstocks').countDocuments({ company: company._id });
  console.log('Query company as string:', byStr, 'as ObjectId:', byObj);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
