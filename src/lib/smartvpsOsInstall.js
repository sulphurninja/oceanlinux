const { humanizeSmartVpsOsLabel } = require('./smartvpsOsTemplates');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseStatusObject(raw) {
  let current = raw;
  for (let depth = 0; depth < 3 && typeof current === 'string'; depth++) {
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }
  return current && typeof current === 'object' ? current : null;
}

function isSmartVpsErrorResponse(response) {
  if (response == null) return true;
  if (typeof response === 'string') {
    const lower = response.toLowerCase().trim();
    if (['success', 'pending', 'completed', 'ok', 'processing'].includes(lower)) return false;
    return lower === 'error' || lower === 'false' || lower.includes('fail');
  }
  if (typeof response === 'object') {
    if (response.success === false) return true;
    if (typeof response.error === 'string' && response.error.toLowerCase() !== '') return true;
  }
  return false;
}

function normalizeSmartVpsIp(ip) {
  return String(ip || '').split(':')[0].trim();
}

async function waitForSmartVpsIdle(api, ip, { maxWaitMs = 120000, pollMs = 5000 } = {}) {
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const parsed = parseStatusObject(await api.status(ip));
    if (parsed) {
      const actionStatus = String(parsed.ActionStatus || '').toLowerCase();
      if (!actionStatus || actionStatus === 'completed' || actionStatus === 'failed') {
        return parsed;
      }
      console.log('[SMARTVPS-OS-INSTALL] Waiting for idle, ActionStatus:', actionStatus);
    }
    await sleep(pollMs);
  }

  const err = new Error('Your server is still processing a previous action. Please wait 5 minutes and try again.');
  err.code = 'SMARTVPS_BUSY';
  throw err;
}

function buildOsRejectedError(os) {
  const label = humanizeSmartVpsOsLabel(os);
  const err = new Error(
    `${label} cannot be installed on this server from its current OS. ` +
    'SmartVPS allows Windows Server 2019 or 2025 from Linux slots — use one of those, or contact support.'
  );
  err.code = 'SMARTVPS_OS_REJECTED';
  return err;
}

/**
 * SmartVPS OS switch — same as Postman:
 *   POST /api/oceansmart/changeos  { ip, os }
 */
async function executeSmartVpsOsInstall(api, serviceIdentifier, osType, opts = {}) {
  const ip = normalizeSmartVpsIp(serviceIdentifier);
  const os = String(osType || '').trim();
  if (!ip) throw new Error('IP required for SmartVPS OS install');
  if (!os) throw new Error('OS template required for SmartVPS OS install');

  await waitForSmartVpsIdle(api, ip, opts.idleWait || {});

  console.log('[SMARTVPS-OS-INSTALL] changeos', { ip, os });
  let changeRes = await api.changeOS(ip, os);

  if (isSmartVpsErrorResponse(changeRes)) {
    console.warn('[SMARTVPS-OS-INSTALL] changeos returned error, retrying after idle wait', { ip, os, changeRes });
    await sleep(opts.retryDelayMs ?? 10000);
    try {
      await waitForSmartVpsIdle(api, ip, { maxWaitMs: 60000, pollMs: 5000 });
    } catch (waitErr) {
      if (waitErr.code === 'SMARTVPS_BUSY') throw waitErr;
    }
    changeRes = await api.changeOS(ip, os);
  }

  if (isSmartVpsErrorResponse(changeRes)) {
    throw buildOsRejectedError(os);
  }

  if (opts.assertActionOk) {
    opts.assertActionOk(changeRes, 'changeos');
  }

  return {
    method: 'changeos',
    os,
    changeosResult: changeRes,
    result: changeRes,
  };
}

module.exports = {
  executeSmartVpsOsInstall,
  isSmartVpsErrorResponse,
  normalizeSmartVpsIp,
  waitForSmartVpsIdle,
};
