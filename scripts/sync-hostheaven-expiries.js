/**
 * Bulk-sync Hostheaven panel expiry → OceanLinux orders + inventory.
 * Usage: bun scripts/sync-hostheaven-expiries.js [companyId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const DEFAULT_COMPANY_ID = '69c96d4076d57fddb2d1a5ec'; // Oceanlinux

(async () => {
  const companyId = process.argv[2] || DEFAULT_COMPANY_ID;
  await mongoose.connect(process.env.MONGOOSE_URL);

  const Company = (await import('../src/models/companyModel.js')).default;
  const IPStock = require('../src/models/ipStockModel.js');
  const { syncAllInventoryExpiriesFromReseller } = require('../src/lib/companyResellerInventorySync.js');

  const company = await Company.findById(companyId).select('resellerApi name').lean();
  if (!company) {
    console.error('Company not found:', companyId);
    process.exit(1);
  }

  const stocks = await IPStock.find({ company: companyId });
  console.log(`Syncing ${stocks.length} stock(s) for ${company.name || companyId}...`);

  const result = await syncAllInventoryExpiriesFromReseller(company, stocks);

  console.log(JSON.stringify({
    inventoryUpdated: result.updated.length,
    ordersUpdated: result.ordersUpdated?.length || 0,
    inventoryFailed: result.failed.length,
    ordersFailed: result.ordersFailed?.length || 0,
    sampleOrderUpdates: (result.ordersUpdated || []).slice(0, 8).map((r) => ({
      ip: r.ipAddress,
      from: r.previousExpiry,
      to: r.expiryDate,
    })),
  }, null, 2));

  await mongoose.disconnect();
})();
