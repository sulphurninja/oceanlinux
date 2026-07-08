import dotenv from 'dotenv';

dotenv.config();

const u = process.env.SMARTVPS_USERNAME;
const p = process.env.SMARTVPS_PASSWORD;
if (!u || !p) {
  console.error('Missing SMARTVPS credentials in .env');
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
const headers = {
  'Content-Type': 'application/json',
  Authorization: auth,
  Accept: 'application/json',
};

const testIps = ['103.83.248.61', '103.83.249.37'];
const domains = ['https://smartvps.online/', 'https://smartvps.store/'];

async function testRestart(domain, ip) {
  const url = new URL('api/ocean/restart', domain).toString();
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ip }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    return {
      url,
      ip,
      httpStatus: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      response: text.slice(0, 300),
    };
  } catch (e) {
    return {
      url,
      ip,
      error: e.cause?.code || e.message,
      ms: Date.now() - started,
    };
  }
}

console.log('=== SmartVPS Restart API Test (no code changes) ===');
console.log('POST api/ocean/restart  |  body: { ip }  |  Basic Auth');
console.log('');

for (const domain of domains) {
  for (const ip of testIps) {
    const result = await testRestart(domain, ip);
    console.log(JSON.stringify(result, null, 2));
    console.log('');
  }
}

// Control: start API on same domain should work for comparison
console.log('=== Control: start API (should work on smartvps.online) ===');
const controlUrl = 'https://smartvps.online/api/oceansmart/start';
const controlIp = testIps[0];
try {
  const res = await fetch(controlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ip: controlIp }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  console.log(JSON.stringify({
    url: controlUrl,
    ip: controlIp,
    httpStatus: res.status,
    response: text.slice(0, 100),
  }, null, 2));
} catch (e) {
  console.log('control error:', e.message);
}
