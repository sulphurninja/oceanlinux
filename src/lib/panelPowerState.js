/** Shared power-state words from every provider panel. */

const RUNNING = new Set(['running', 'online', 'on', 'started', 'up', 'active', 'powered_on', 'poweron', '1', 'true']);
const STOPPED = new Set(['stopped', 'offline', 'off', 'shutdown', 'shutoff', 'down', 'terminated', 'inactive', 'powered_off', 'poweroff', '0', 'false']);
const SUSPENDED = new Set(['suspended', 'paused', 'cancelled']);
const BUSY = new Set([
  'processing',
  'pending',
  'starting',
  'stopping',
  'rebooting',
  'reinstalling',
  'resetting',
  'busy',
  'installing',
  'provisioning',
  'building',
  'creating',
]);

function normalizeReportedPowerState(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return '';
  if (RUNNING.has(raw)) return 'running';
  if (STOPPED.has(raw)) return 'stopped';
  if (SUSPENDED.has(raw)) return 'suspended';
  if (BUSY.has(raw)) return 'busy';
  return '';
}

module.exports = { normalizeReportedPowerState };
