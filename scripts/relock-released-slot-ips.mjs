import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^MONGOOSE_URL=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    // ignore
  }
  return process.env.MONGOOSE_URL || '';
}

function parseProxyKey(value) {
  const trimmed = String(value || '').trim();
  const [ip, portRaw] = trimmed.split(':');
  const port = Number(portRaw);
  if (!ip || !Number.isFinite(port)) return null;
  return `${ip}:${port}`;
}

const uri = loadEnv();
if (!uri) {
  console.error('MONGOOSE_URL not found');
  process.exit(1);
}

const targetKeys = new Set(
  readFileSync(resolve(process.cwd(), 'scripts/released-slot-ips-81.txt'), 'utf8')
    .split('\n')
    .map((line) => parseProxyKey(line))
    .filter(Boolean),
);

await mongoose.connect(uri);
const packagesCol = mongoose.connection.db.collection('slotippackages');
const packages = await packagesCol.find({}).toArray();

let relocked = 0;
let alreadyLocked = 0;
let notFound = 0;
let skippedResold = 0;
const details = [];

for (const key of targetKeys) {
  const [ip, portRaw] = key.split(':');
  const port = Number(portRaw);
  let matched = false;

  for (const pkg of packages) {
    for (const row of pkg.ips || []) {
      if (String(row.ip) !== ip || Number(row.port) !== port) continue;
      matched = true;

      if (row.allocated && row.orderId) {
        skippedResold += 1;
        details.push({ proxy: key, action: 'skipped_resold_to_new_order', orderId: String(row.orderId) });
        break;
      }

      if (row.allocated && !row.orderId) {
        alreadyLocked += 1;
        details.push({ proxy: key, action: 'already_locked' });
        break;
      }

      await packagesCol.updateOne(
        { _id: pkg._id, 'ips._id': row._id },
        {
          $set: {
            'ips.$.allocated': true,
            'ips.$.orderId': null,
            'ips.$.allocatedAt': row.allocatedAt || new Date(),
          },
        },
      );
      relocked += 1;
      details.push({ proxy: key, action: 'relocked', packageId: String(pkg._id) });
      break;
    }
    if (matched) break;
  }

  if (!matched) {
    notFound += 1;
    details.push({ proxy: key, action: 'not_found_in_packages' });
  }
}

console.log(
  JSON.stringify(
    {
      targetCount: targetKeys.size,
      relocked,
      alreadyLocked,
      skippedResold,
      notFound,
      details,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
