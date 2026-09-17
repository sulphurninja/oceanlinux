const VALID_OS = ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'];

function normalizeOs(raw) {
  const s = String(raw || '').trim();
  if (VALID_OS.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.includes('windows')) return 'Windows 2022 64';
  if (lower.includes('centos')) return 'CentOS 7';
  return 'Ubuntu 22';
}

const IPV4 = /\d{1,3}(?:\.\d{1,3}){3}/;

function looksLikePort(segment) {
  if (!/^\d{1,5}$/.test(String(segment || '').trim())) return false;
  const n = Number(segment);
  return n > 0 && n <= 65535;
}

function stripOsSuffix(password) {
  let osPart = '';
  let pass = password;
  for (const os of VALID_OS) {
    const suffix = `:${os}`;
    if (pass.endsWith(suffix)) {
      osPart = os;
      pass = pass.slice(0, -suffix.length);
      break;
    }
  }
  return { password: pass, osPart };
}

/**
 * Colon lines:
 * - Proxy: ip:port:username:password
 * - VPS/RDP: ip:username:password
 */
function parseColonCredentialLine(line, planCategory) {
  const trimmed = String(line || '').trim();
  const ipMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(.+)$/);
  if (!ipMatch) return null;

  const ipAddress = ipMatch[1];
  const rest = ipMatch[2];
  const segments = rest.split(':');

  const tryProxy = planCategory === 'premium_proxy';

  if (tryProxy && segments.length >= 3 && looksLikePort(segments[0])) {
    const port = segments[0].trim();
    const username = segments[1]?.trim() || '';
    let password = segments.slice(2).join(':');
    const stripped = stripOsSuffix(password);
    password = stripped.password;
    if (!username || !password) return null;
    return { ipAddress, port, username, password, osPart: stripped.osPart };
  }

  const userSep = rest.indexOf(':');
  if (userSep <= 0) return null;

  const username = rest.slice(0, userSep).trim();
  let password = rest.slice(userSep + 1);
  const stripped = stripOsSuffix(password);
  password = stripped.password;

  if (!username || !password) return null;
  return { ipAddress, port: '', username, password, osPart: stripped.osPart };
}

function parseDelimitedLine(line, sep, planCategory) {
  const parts = line.split(sep).map((p) => p.trim());
  if (parts.length < 3) return null;

  const ipRaw = parts[0];
  const ipAddress = ipRaw.split(':')[0].trim();

  if (planCategory === 'premium_proxy' && parts.length >= 4 && looksLikePort(parts[1])) {
    const port = parts[1];
    const username = parts[2] || '';
    const password = parts.slice(3).join(sep === '|' ? '|' : ',');
    if (!ipAddress || !username || !password) return null;
    return { ipAddress, port, username, password, osPart: '' };
  }

  const [_, username, password, osPart] = parts;
  if (!ipAddress || !password) return null;
  return {
    ipAddress,
    port: '',
    username: username || 'root',
    password,
    osPart: osPart || '',
  };
}

function defaultOsForPlanCategory(planCategory) {
  if (planCategory === 'windows') return 'Windows 2022 64';
  if (planCategory === 'premium_proxy') return 'Ubuntu 22';
  return 'Ubuntu 22';
}

/**
 * Parse bulk lines:
 * - Proxy: ip:port:username:password or ip,port,user,pass
 * - VPS: ip:username:password or ip,user,pass[,os]
 */
function parseTrialVpsBulkLines(text, options = {}) {
  const planCategory = options.planCategory || 'linux';
  const defaultOs = options.defaultOs || defaultOsForPlanCategory(planCategory);

  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const slots = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let parsed = null;

    if (IPV4.test(line) && line.includes(':') && !line.includes(',') && !line.includes('|')) {
      parsed = parseColonCredentialLine(line, planCategory);
    } else if (line.includes('|')) {
      parsed = parseDelimitedLine(line, '|', planCategory);
    } else {
      parsed = parseDelimitedLine(line, ',', planCategory);
    }

    if (!parsed) {
      errors.push({
        line: i + 1,
        content: line,
        reason:
          planCategory === 'premium_proxy'
            ? 'Proxy: ip:port:username:password or ip,port,user,pass'
            : 'VPS: ip:username:password or ip,user,pass',
      });
      continue;
    }

    slots.push({
      ipAddress: parsed.ipAddress,
      port: parsed.port ? String(parsed.port) : '',
      username: parsed.username || 'root',
      password: parsed.password,
      os: normalizeOs(parsed.osPart || defaultOs),
      allocated: false,
      orderId: null,
      allocatedAt: null,
    });
  }

  return { slots, errors };
}

function calculateTrialExpiryDate(trialDays, fromDate = new Date()) {
  const days = Math.max(1, Math.floor(Number(trialDays) || 7));
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d;
}

module.exports = { parseTrialVpsBulkLines, calculateTrialExpiryDate };
