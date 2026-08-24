/**
 * PM2 background worker — calls cleanup API every 6 hours.
 * Avoids Next.js instrumentation bundling Node built-ins (dns, etc.).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2 * 60 * 1000;

function readEnvVar(key) {
  if (fs.existsSync(ENV_FILE)) {
    const line = fs
      .readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    if (line) {
      let val = line.slice(key.length + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      return val;
    }
  }
  return process.env[key];
}

async function runCleanup() {
  const secret = readEnvVar('CRON_SECRET');
  const port = readEnvVar('PORT') || '3000';
  if (!secret) {
    console.error('[SCHEDULED-CLEANUP] CRON_SECRET missing in .env');
    return;
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/orders/cleanup-expired`, {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[SCHEDULED-CLEANUP] API error:', res.status, data.message || data.error || '');
      return;
    }
    if (Number(data.deleted) > 0) {
      console.log(`[SCHEDULED-CLEANUP] Deleted ${data.deleted} expired orders`);
    }
  } catch (err) {
    console.error('[SCHEDULED-CLEANUP] Failed:', err?.message || err);
  }
}

console.log('[SCHEDULED-CLEANUP] Worker started — checks every 6h (3+ day expired grace)');
setTimeout(runCleanup, STARTUP_DELAY_MS);
setInterval(runCleanup, INTERVAL_MS);
