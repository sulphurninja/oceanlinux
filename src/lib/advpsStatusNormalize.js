/**
 * Normalize ADVPS API envelopes per https://api.advps.org — GET .../services/{id}/status
 * puts live VM state in data.vmStatus.status, provisioned power in data.service.runningStatus.
 */

function unwrapAdvpsEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.data !== undefined ? payload.data : payload;
}

/** Human-readable running/power label for logs and sync payloads */
function pickAdvpsRunningStatusRaw(d) {
  if (!d || typeof d !== 'object') return '';
  return (
    d.vmStatus?.status ??
    d.service?.runningStatus ??
    d.runningStatus ??
    ''
  );
}

function pickAdvpsIp(d, fallback = '') {
  if (!d || typeof d !== 'object') return fallback || '';
  return d.service?.ip ?? d.ip ?? fallback ?? '';
}

function pickAdvpsUptime(d) {
  if (!d || typeof d !== 'object') return undefined;
  const u = d.vmStatus?.uptime ?? d.uptime;
  return u;
}

function normalizeAdvpsPowerState(d) {
  if (!d || typeof d !== 'object') return 'unknown';

  const raw =
    d.vmStatus?.status ??
    d.service?.runningStatus ??
    d.runningStatus ??
    d.powerState ??
    d.state ??
    d.status;

  if (typeof raw === 'boolean') return raw ? 'running' : 'stopped';
  if (raw == null || raw === '') return 'unknown';

  const sl = String(raw).toLowerCase().trim();
  if (['running', 'online', 'started', 'active', 'up'].includes(sl)) return 'running';
  if (['stopped', 'offline', 'shutdown', 'inactive', 'down'].includes(sl)) return 'stopped';

  const up = sl.toUpperCase();
  if (up === 'RUNNING' || up === 'STARTED') return 'running';
  if (up === 'STOPPED') return 'stopped';

  return 'unknown';
}

module.exports = {
  unwrapAdvpsEnvelope,
  pickAdvpsRunningStatusRaw,
  pickAdvpsIp,
  pickAdvpsUptime,
  normalizeAdvpsPowerState,
};
