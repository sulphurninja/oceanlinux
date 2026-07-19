require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = (process.env.MONGOOSE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const primevps = await db.collection('companies').findOne({ slug: 'primevps' });
  const linked = await db.collection('ipstocks').countDocuments({ company: primevps._id });

  const primeTagged = await db
    .collection('ipstocks')
    .find({ tags: { $in: ['primevps', 'primevm', 'reseller-api'] } })
    .project({ name: 1, company: 1, 'defaultConfigurations.company': 1, availabilityManual: 1 })
    .toArray();

  console.log('Linked to primevps company:', linked);
  console.log('Prime-tagged stocks:', primeTagged.length);
  for (const s of primeTagged) {
    const same =
      s.company && String(s.company) === String(primevps._id) ? 'OK' : 'MISMATCH';
    console.log(same, s.name.slice(0, 50), 'company=', s.company, 'manual=', s.availabilityManual);
    if (s.defaultConfigurations && typeof s.defaultConfigurations === 'object') {
      const keys = Object.keys(s.defaultConfigurations);
      console.log('  defaultConfigurations keys:', keys.join(', '));
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
