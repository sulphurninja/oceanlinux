/**
 * Parse proxy string: ip:port:username:password (password may contain colons).
 */
function parseProxyLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length < 4) return null;

  const ip = parts[0].trim();
  const port = parseInt(parts[1], 10);
  const username = parts[2].trim();
  const password = parts.slice(3).join(':');

  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
  if (!username || !password) return null;

  return { ip, port, username, password, proxy: trimmed };
}

module.exports = { parseProxyLine };
