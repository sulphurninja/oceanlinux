/**
 * One-time: allow duplicate display names on users collection.
 * Run: node scripts/drop-user-name-unique-index.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGOOSE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGOOSE_URL / MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('users');
  const indexes = await collection.indexes();

  const nameIndex = indexes.find((idx) => idx.key?.name === 1 && idx.unique);
  if (!nameIndex) {
    console.log('No unique index on name — nothing to drop.');
    await mongoose.disconnect();
    return;
  }

  await collection.dropIndex(nameIndex.name);
  console.log(`Dropped unique index: ${nameIndex.name}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
