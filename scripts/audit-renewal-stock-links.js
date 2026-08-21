require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const fix = process.argv.includes('--fix');

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);

  const { auditRenewalPricing, fixAllRenewalStockLinks } = await import('../src/lib/orderRenewalPricingServer.js');
  const Order = (await import('../src/models/orderModel.js')).default;
  const IPStock = (await import('../src/models/ipStockModel.js')).default;
  const audit = await auditRenewalPricing({ limit: 10000 });
  console.log('=== AUDIT ===');
  console.log(JSON.stringify(audit, null, 2));

  const { getCurrentListPriceFromStock, getOrderRenewalPrice } = await import('../src/lib/orderRenewalPricing.js');

  const stale = await fixAllRenewalStockLinks({ dryRun: !fix, limit: 10000 });
  console.log(`\n=== STALE (${fix ? 'FIX' : 'DRY'}): ${stale.count} ===`);
  for (const row of stale.results) {
    const order = await Order.findById(row.orderId).lean();
    const oldStock = await IPStock.findById(row.oldStockId).select('name memoryOptions').lean();
    const wrongRenewal = getOrderRenewalPrice(
      order,
      getCurrentListPriceFromStock(oldStock, order?.memory)
    );
    console.log(JSON.stringify({
      ip: row.ipAddress,
      orderId: row.orderId,
      productName: row.productName,
      wrongStock: oldStock?.name,
      wrongRenewal,
      correctStock: row.newStockName,
      correctRenewal: row.newRenewalPrice,
      diff: wrongRenewal - row.newRenewalPrice,
    }));
  }

  await mongoose.disconnect();
})();
