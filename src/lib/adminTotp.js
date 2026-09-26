/**
 * Google Authenticator (TOTP) for the admin panel gate.
 * The secret stays on this server, encrypted with the admin panel password.
 * Mongo cannot mint a valid code.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.cwd(), 'data', 'admin-totp.json');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'OceanLinux';
const ACCOUNT = 'admin';

function encryptionKey() {
  const secret = process.env.ADMIN_PANEL_PASSWORD || '';
  return crypto.createHash('sha256').update(`oceanlinux-admin-totp|${secret}`).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  const buf = Buffer.from(String(payload || ''), 'base64');
  if (buf.length < 29) return '';
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store), { mode: 0o600 });
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

function codesMatch(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyTotp(secret, token) {
  const code = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code) || !secret) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (let skew = -1; skew <= 1; skew += 1) {
    if (codesMatch(hotp(secret, counter + skew), code)) return true;
  }
  return false;
}

function activeSecret() {
  const store = readStore();
  if (!store.active) return '';
  try {
    return decrypt(store.active);
  } catch {
    return '';
  }
}

function isAdminTotpEnabled() {
  return Boolean(activeSecret());
}

function otpauthUrl(secret) {
  const label = encodeURIComponent(`${ISSUER}:${ACCOUNT}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
}

function beginAdminTotpSetup() {
  if (isAdminTotpEnabled()) return null;
  const secret = base32Encode(crypto.randomBytes(20));
  const store = readStore();
  store.pending = encrypt(secret);
  writeStore(store);
  return { secret, otpauthUrl: otpauthUrl(secret) };
}

function confirmAdminTotpSetup(token) {
  const store = readStore();
  if (!store.pending) return false;
  let secret = '';
  try {
    secret = decrypt(store.pending);
  } catch {
    return false;
  }
  if (!verifyTotp(secret, token)) return false;
  store.active = store.pending;
  delete store.pending;
  writeStore(store);
  return true;
}

function verifyAdminTotp(token) {
  return verifyTotp(activeSecret(), token);
}

/** Block a sensitive admin action unless the current authenticator code matches. */
function adminTotpFailure(token) {
  if (!isAdminTotpEnabled()) {
    return {
      status: 403,
      message: 'Set up Google Authenticator on the admin login before doing this.',
    };
  }
  if (!verifyAdminTotp(token)) {
    return {
      status: 401,
      message: 'Enter the current Google Authenticator code.',
    };
  }
  return null;
}

module.exports = {
  isAdminTotpEnabled,
  beginAdminTotpSetup,
  confirmAdminTotpSetup,
  verifyAdminTotp,
  adminTotpFailure,
  otpauthUrl,
};
