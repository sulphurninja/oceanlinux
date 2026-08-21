import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^MONGOOSE_URL=(.+)$/);
    if (m) return m[1].trim();
  }
  return process.env.MONGOOSE_URL || '';
}

process.env.MONGOOSE_URL = loadEnv();
await mongoose.connect(process.env.MONGOOSE_URL);

const { purgeExpiredSlotIpHistory } = require('../src/lib/slotIpExpiryCleanup.js');
const result = await purgeExpiredSlotIpHistory({ olderThanDays: 30, dryRun: false });
console.log(JSON.stringify(result, null, 2));
await mongoose.disconnect();
