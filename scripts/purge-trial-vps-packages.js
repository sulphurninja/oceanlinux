/**
 * One-off admin utility: delete ALL TrialVpsPackage documents.
 * Does not delete customer orders — only admin trial inventory.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI || process.env.MONGOOSE_URL;
  if (!uri) {
    console.error('MONGODB_URI / MONGOOSE_URL not set (.env.local)');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const TrialVpsPackage = require('../src/models/trialVpsPackageModel');
  const count = await TrialVpsPackage.countDocuments({});
  const res = await TrialVpsPackage.deleteMany({});
  console.log(`Trial VPS packages before: ${count}, deleted: ${res.deletedCount}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
