import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const patterns = ['phoneixvps@gmail.com', 'phoenixvps@gmail.com', 'phoneix', 'phoenix'];

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const R = mongoose.connection.collection('resellers');
  for (const p of patterns) {
    const r = await R.findOne({ email: new RegExp(p, 'i') });
    console.log(p, r ? `${r.email} | ${r.businessName} | ${r._id}` : 'NOT FOUND');
  }
  const all = await R.find({ $or: [{ email: /phoneix/i }, { email: /phoenix/i }] })
    .project({ email: 1, businessName: 1 })
    .toArray();
  console.log('all:', all);
  await mongoose.disconnect();
}

main().catch(console.error);
