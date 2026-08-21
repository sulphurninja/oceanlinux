/**
 * Bulk replace slot IP proxy credentials (same IP/port/user, new password).
 *
 * Usage:
 *   node scripts/bulk-replace-slot-ip-credentials.mjs          # dry run
 *   node scripts/bulk-replace-slot-ip-credentials.mjs --apply    # write to DB
 */

import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      const m = raw.match(/MONGOOSE_URL=(.+)/);
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    } catch {
      // try next file
    }
  }
  return process.env.MONGOOSE_URL?.trim().replace(/^['"]|['"]$/g, '') || '';
}

function parseProxyLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length < 4) return null;
  const ip = parts[0];
  const port = Number(parts[1]);
  const password = parts[parts.length - 1];
  const username = parts.slice(2, -1).join(':');
  if (!ip || !Number.isFinite(port) || !username || !password) return null;
  return { ip, port, username, password, proxy: trimmed };
}

/** ip:port:user:newPass — matched 1:1 by ip + port + username */
function loadReplacementLines() {
  const fileArgIdx = process.argv.indexOf('--file');
  if (fileArgIdx !== -1 && process.argv[fileArgIdx + 1]) {
    const filePath = resolve(process.cwd(), process.argv[fileArgIdx + 1]);
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map((l) => parseProxyLine(l))
      .filter(Boolean);
  }

  return `
103.169.81.13:8000:boss252proxy265:eb9gdajv
103.169.81.14:8000:boss252proxy266:uRV3LBs7
103.169.81.15:8000:boss252proxy267:Lh1bDCqB
103.169.81.16:8000:boss252proxy268:bX1at8sp
103.169.81.17:8000:boss252proxy269:5NtPgokb
103.169.81.18:8000:boss252proxy270:UfcNtxmr
103.169.81.19:8000:boss252proxy271:lYf4VHbt
103.169.81.20:8000:boss252proxy272:i56sqlo4
103.169.81.21:8000:boss252proxy273:Bbw1RlI0
103.169.81.22:8000:boss252proxy274:jOHbUotx
`
    .split('\n')
    .map((l) => parseProxyLine(l))
    .filter(Boolean);
}

const NEW_LINES = loadReplacementLines();

const apply = process.argv.includes('--apply');
const uri = loadEnv();

if (!uri) {
  console.error('MONGOOSE_URL not found in .env.local or environment');
  process.exit(1);
}

await mongoose.connect(uri);
const packagesCol = mongoose.connection.db.collection('slotippackages');
const ordersCol = mongoose.connection.db.collection('orders');

const summary = {
  mode: apply ? 'apply' : 'dry-run',
  targetCount: NEW_LINES.length,
  packageRowsUpdated: 0,
  ordersUpdated: 0,
  notFound: [],
  usernameMismatch: [],
  details: [],
};

for (const cred of NEW_LINES) {
  const pkg = await packagesCol.findOne({ 'ips.ip': cred.ip, 'ips.port': cred.port });
  if (!pkg) {
    summary.notFound.push(`${cred.ip}:${cred.port}`);
    continue;
  }

  const row = (pkg.ips || []).find(
    (r) => String(r.ip) === cred.ip && Number(r.port) === cred.port,
  );
  if (!row) {
    summary.notFound.push(`${cred.ip}:${cred.port} (row missing)`);
    continue;
  }

  if (String(row.username) !== cred.username) {
    summary.usernameMismatch.push({
      key: `${cred.ip}:${cred.port}`,
      expected: cred.username,
      found: row.username,
    });
    continue;
  }

  const oldProxy = row.proxy;
  const oldPassword = row.password;
  let ordersTouched = 0;

  if (apply) {
    await packagesCol.updateOne(
      { _id: pkg._id, 'ips._id': row._id },
      {
        $set: {
          'ips.$.proxy': cred.proxy,
          'ips.$.password': cred.password,
          'ips.$.username': cred.username,
        },
      },
    );
    summary.packageRowsUpdated += 1;

    const orderIds = new Set();
    if (row.orderId) orderIds.add(String(row.orderId));

    const bySlotIpId = await ordersCol
      .find({ slotIpId: String(row._id) })
      .project({ _id: 1 })
      .toArray();
    for (const o of bySlotIpId) orderIds.add(String(o._id));

    const ipKey = `${cred.ip}:${cred.port}`;
    const byIp = await ordersCol
      .find({
        $or: [{ ipAddress: ipKey }, { ipAddress: new RegExp(`^${cred.ip.replace(/\./g, '\\.')}:${cred.port}`) }],
        provider: 'slotip',
      })
      .project({ _id: 1 })
      .toArray();
    for (const o of byIp) orderIds.add(String(o._id));

    for (const oid of orderIds) {
      const res = await ordersCol.updateOne(
        { _id: new mongoose.Types.ObjectId(oid) },
        {
          $set: {
            password: cred.password,
            username: cred.username,
            ipAddress: ipKey,
          },
        },
      );
      if (res.modifiedCount > 0) ordersTouched += 1;
    }
    summary.ordersUpdated += ordersTouched;
  }

  summary.details.push({
    ip: cred.ip,
    port: cred.port,
    username: cred.username,
    oldPassword,
    newPassword: cred.password,
    oldProxy,
    newProxy: cred.proxy,
    allocated: !!row.allocated,
    orderId: row.orderId ? String(row.orderId) : null,
    ordersTouched: apply ? ordersTouched : '(dry-run)',
  });
}

console.log(JSON.stringify(summary, null, 2));
await mongoose.disconnect();
