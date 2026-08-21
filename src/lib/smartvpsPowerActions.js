function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSmartVpsErrorResponse(response) {
  if (response == null) return true;
  if (typeof response === 'string') {
    const lower = response.toLowerCase().trim();
    if (['success', 'pending', 'completed', 'ok'].includes(lower)) return false;
    return lower === 'error' || lower === 'false' || lower.includes('fail');
  }
  if (typeof response === 'object') {
    if (response.success === false) return true;
    if (typeof response.error === 'string' && response.error.toLowerCase() !== '') return true;
  }
  return false;
}

function assertSmartVpsActionOk(response, actionLabel) {
  if (isSmartVpsErrorResponse(response)) {
    const rawDetail = typeof response === 'string' ? response : (response?.message || response?.error || 'unknown error');
    const generic = String(rawDetail).trim().toLowerCase();

    if (generic === 'failed' || generic === 'error' || generic === 'false') {
      throw new Error(
        `SmartVPS API rejected the ${actionLabel} request (reseller API returned "${generic}"). ` +
        `Their web panel and this HTTP API are separate systems — start/stop on the SmartVPS panel can work ` +
        `while the API flag (ActionStatus) is still "failed". Ask SmartVPS support to reset the API action ` +
        `state for this IP, or manage power from their panel until it is cleared.`
      );
    }

    throw new Error(`SmartVPS ${actionLabel} failed: ${rawDetail}`);
  }
}

function parseSmartVpsStatusPayload(response) {
  let current = response;
  for (let depth = 0; depth < 3 && typeof current === 'string'; depth++) {
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }
  return current;
}

function computeSmartVpsPowerState(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'unknown';
  const powerStatusLower = String(parsed.PowerStatus || '').toLowerCase().trim();
  if (['online', 'on', 'running', 'active'].includes(powerStatusLower)) return 'running';
  if (['offline', 'off', 'stopped', 'down'].includes(powerStatusLower)) return 'stopped';
  return 'unknown';
}

async function getSmartVpsParsedStatus(api, serviceIdentifier) {
  const statusData = await api.status(serviceIdentifier);
  return parseSmartVpsStatusPayload(statusData);
}

async function ensureSmartVpsNotBusy(api, serviceIdentifier) {
  const parsed = await getSmartVpsParsedStatus(api, serviceIdentifier);
  if (!isPlainObject(parsed)) return parsed;

  const actionStatus = String(parsed.ActionStatus || '').toLowerCase();

  if (actionStatus === 'processing' || actionStatus === 'pending') {
    const err = new Error('Server is still processing a previous action. Please wait 5 minutes and try again.');
    err.code = 'SMARTVPS_BUSY';
    throw err;
  }

  // Do NOT block on ActionStatus=failed here — call the SmartVPS action API and
  // let its response decide. Some slots show failed in status while the panel
  // still works; others genuinely return "failed" from start/stop/format.
  if (actionStatus === 'failed') {
    console.warn(
      `[SMARTVPS] ActionStatus=failed for ${parsed.IP || serviceIdentifier} — proceeding with API call`
    );
  }

  return parsed;
}

async function waitForSmartVpsPowerState(api, serviceIdentifier, target, { maxWaitMs = 120000, pollMs = 4000 } = {}) {
  const wantOnline = target === 'online' || target === 'running';
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const parsed = await getSmartVpsParsedStatus(api, serviceIdentifier);
    if (isPlainObject(parsed)) {
      const powerState = computeSmartVpsPowerState(parsed);
      const powerStatus = String(parsed.PowerStatus || '').toLowerCase().trim();
      const actionStatus = String(parsed.ActionStatus || '').toLowerCase();

      if (wantOnline) {
        if (powerState === 'running' || ['online', 'on'].includes(powerStatus)) {
          return parsed;
        }
      } else if (
        powerState === 'stopped' ||
        ['offline', 'off', 'down'].includes(powerStatus) ||
        (actionStatus === 'completed' && powerState !== 'running')
      ) {
        return parsed;
      }
    }

    await sleep(pollMs);
  }

  throw new Error(
    wantOnline
      ? 'Timed out waiting for the server to come back online after restart. Try Refresh in a minute.'
      : 'Timed out waiting for the server to shut down before restart. Try again in a minute.'
  );
}

async function executeSmartVpsRestart(api, serviceIdentifier) {
  await ensureSmartVpsNotBusy(api, serviceIdentifier);

  const stopResult = await api.stop(serviceIdentifier);
  assertSmartVpsActionOk(stopResult, 'stop');

  try {
    await waitForSmartVpsPowerState(api, serviceIdentifier, 'offline', { maxWaitMs: 120000, pollMs: 4000 });
  } catch (waitErr) {
    console.warn('[SMARTVPS-RESTART] Stop wait timed out, using fallback delay:', waitErr.message);
    await sleep(10000);
  }

  const startResult = await api.start(serviceIdentifier);
  assertSmartVpsActionOk(startResult, 'start');

  return {
    stopResult,
    startResult,
    message: 'Restart completed (stop → wait → start)',
  };
}

module.exports = {
  assertSmartVpsActionOk,
  ensureSmartVpsNotBusy,
  executeSmartVpsRestart,
};
