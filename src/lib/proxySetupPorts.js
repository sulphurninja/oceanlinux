/** Allowed Squid proxy listen ports for PuTTY / SSH setup tool. */
const PROXY_SETUP_PORTS = [3128, 5515, 5555, 8080, 8086, 8182];

const DEFAULT_PROXY_SETUP_PORT = 3128;

function normalizeProxySetupPort(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  if (!PROXY_SETUP_PORTS.includes(n)) return null;
  return n;
}

function listProxySetupPorts() {
  return [...PROXY_SETUP_PORTS];
}

module.exports = {
  PROXY_SETUP_PORTS,
  DEFAULT_PROXY_SETUP_PORT,
  normalizeProxySetupPort,
  listProxySetupPorts,
};
