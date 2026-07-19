require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = (process.env.MONGOOSE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const company = await db.collection('companies').findOne({ slug: 'primevps' });
  console.log('resellerApi:', JSON.stringify(company.resellerApi, null, 2));
  console.log('netbayApi:', JSON.stringify(company.netbayApi, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
