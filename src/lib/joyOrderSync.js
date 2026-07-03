/**
 * Map Joy Services machine payloads → OceanLinux order fields.
 * Joy exposes expiry via `machine_list.expire` (human date when set) and/or
 * `extime` (platform-specific epoch string). We prefer `expire`, then coerce
 * `extime` using the same heuristics Joy's dashboard likely uses.
 */

/**
 * @param {unknown} raw
 * @returns {Date|null}
 */
function parseJoyExpiryDate(raw) {
  if (raw == null || raw === '') return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  const str = String(raw).trim();
  if (!str || str.toLowerCase() === 'null') return null;

  // ISO / locale date strings from `expire`
  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime()) && direct.getFullYear() >= 2000 && direct.getFullYear() <= 2100) {
    return direct;
  }

  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return null;

  /** @returns {Date|null} */
  const fromUnixMs = (ms) => {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    if (y < 2000 || y > 2100) return null;
    return d;
  };

  // Unix seconds (e.g. 1859621398)
  if (num >= 1e9 && num < 1e11) {
    return fromUnixMs(num * 1000);
  }

  // Unix milliseconds
  if (num >= 1e12 && num < 1e14) {
    return fromUnixMs(num);
  }

  // Some Joy records use longer internal values — try ms after scaling down.
  for (const div of [1000, 1000000, 10000000]) {
    const scaled = num / div;
    if (scaled >= 1e9 && scaled < 1e11) {
      const d = fromUnixMs(scaled * 1000);
      if (d) return d;
    }
  }

  return null;
}

/**
 * Pick the best expiry date from Joy machine_list row + optional machine_info.
 * @param {object|null|undefined} machine
 * @param {object|null|undefined} machineInfo
 */
function pickJoyExpiryDate(machine, machineInfo) {
  const candidates = [
    machine?.expire,
    machineInfo?.expire,
    machine?.extime,
    machineInfo?.extime,
  ];

  for (const raw of candidates) {
    const d = parseJoyExpiryDate(raw);
    if (d) return d;
  }
  return null;
}

/**
 * Build MongoDB $set fields from Joy machine_list + machine_info payloads.
 * @param {object|null|undefined} machine  row from machine_list (incl. ip, expire, extime)
 * @param {object|null|undefined} machineInfo  machine_info response
 * @param {object|null|undefined} order
 */
function applyJoyMachineToOrderUpdates(machine, machineInfo, order) {
  const dbUpdates = { lastSyncTime: new Date() };
  const changes = [];

  const freshIp = (machineInfo?.ip || machine?.ip || '').trim();
  if (freshIp && freshIp !== (order?.ipAddress || '').trim()) {
    dbUpdates.ipAddress = freshIp;
    changes.push('ipAddress');
  }

  const expiryDate = pickJoyExpiryDate(machine, machineInfo);
  if (expiryDate) {
    const prevMs = order?.expiryDate ? new Date(order.expiryDate).getTime() : null;
    const nextMs = expiryDate.getTime();
    if (prevMs !== nextMs || !order?.expiryDate) {
      dbUpdates.expiryDate = expiryDate;
      changes.push('expiryDate');
    }
  }

  return { dbUpdates, changes, expiryDate };
}

module.exports = {
  parseJoyExpiryDate,
  pickJoyExpiryDate,
  applyJoyMachineToOrderUpdates,
};
