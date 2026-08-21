require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

(async () => {
  const { refreshNetbayStockForCustomer } = require('../src/lib/netbayLiveStock');
  const { default: connectDB } = await import('../src/lib/db.js');
  await connectDB();
  console.log('Force refreshing Netbay stock…');
  const result = await refreshNetbayStockForCustomer({ force: true });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
