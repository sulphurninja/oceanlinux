require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = (process.env.MONGOOSE_URL || process.env.MONGODB_URI || '').trim().replace(/^['"]|['"]$/g, '');
  if (!uri) throw new Error('MONGOOSE_URL missing');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const company = await db.collection('companies').findOne({ slug: 'primevps' });
  if (!company) {
    console.log('No company with slug primevps');
    return;
  }
  console.log('Company:', company._id.toString(), company.name);

  const stocks = await db
    .collection('ipstocks')
    .find({ company: company._id })
    .project({ name: 1, stockCount: 1, available: 1, availabilityManual: 1, hiddenFromStore: 1, 'defaultConfigurations.company': 1 })
    .sort({ name: 1 })
    .toArray();

  console.log('Stocks linked to company:', stocks.length);
  for (const s of stocks) {
    console.log(
      '-',
      s.name,
      'count=',
      s.stockCount,
      'avail=',
      s.available,
      'manual=',
      s.availabilityManual,
      'hidden=',
      s.hiddenFromStore,
      'mode=',
      s.defaultConfigurations?.company?.fulfillmentMode
    );
  }

  const unlinked = await db.collection('ipstocks').countDocuments({
    tags: { $in: ['primevps', 'primevm', 'reseller-api'] },
    $or: [{ company: null }, { company: { $exists: false } }],
  });
  console.log('PrimeVPS-tagged stocks without company link:', unlinked);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
