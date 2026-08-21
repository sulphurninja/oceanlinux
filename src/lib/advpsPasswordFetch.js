/**
 * ADVPS password discovery — status/purchase often omit or stale the password after
 * admin changes it on the ADVPS panel. This module deep-scans responses and can
 * fall back to the generate-password endpoint (read-only when already generated).
 */

function deepCollectPasswords(payload, found = new Set()) {
  if (!payload || typeof payload !== 'object') return found;

  if (Array.isArray(payload)) {
    for (const item of payload) deepCollectPasswords(item, found);
    return found;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      const k = key.toLowerCase();
      if (
        (k.includes('pass') || k === 'pwd' || k === 'secret') &&
        value.length >= 4 &&
        value.length <= 128 &&
        !/\s/.test(value)
      ) {
        found.add(value.trim());
      }
    } else if (value && typeof value === 'object') {
      deepCollectPasswords(value, found);
    }
  }
  return found;
}

function pickPasswordCandidate(storedPassword, ...groups) {
  const stored = String(storedPassword || '').trim();
  const ordered = [];

  for (const group of groups) {
    if (!group) continue;
    if (typeof group === 'string') {
      ordered.push(group);
      continue;
    }
    if (group instanceof Set) {
      ordered.push(...group);
      continue;
    }
    if (Array.isArray(group)) {
      ordered.push(...group);
    }
  }

  const seen = new Set();
  for (const raw of ordered) {
    const next = String(raw || '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    if (next !== stored) return next;
  }
  return '';
}

function extractPasswordFromGenerateError(err) {
  const msg = String(err?.message || '');
  const body = err?.advpsBody;

  const fromMsg = msg.match(/existingPassword[:\s"']+([^"'\s},]+)/i);
  if (fromMsg?.[1]) return fromMsg[1].trim();

  if (body && typeof body === 'object') {
    const passwords = [...deepCollectPasswords(body)];
    if (passwords.length === 1) return passwords[0];
  }
  return '';
}

/**
 * Last resort: ADVPS may refuse to regenerate but embed the live password in the
 * error body when password was already generated on their panel.
 */
async function tryFetchAdvpsPasswordViaGenerate(api, serviceId) {
  try {
    const passRes = await api.generatePassword(serviceId, { timeoutMs: 30_000 });
    const d = passRes?.data || passRes || {};
    const pwd = String(d.password || d.newPassword || d.existingPassword || '').trim();
    if (pwd) {
      return { password: pwd, source: 'generate-password' };
    }
    const deep = [...deepCollectPasswords(passRes)];
    if (deep.length === 1) {
      return { password: deep[0], source: 'generate-password-deep' };
    }
  } catch (err) {
    const extracted = extractPasswordFromGenerateError(err);
    if (extracted) {
      return { password: extracted, source: 'generate-password-error' };
    }
    const locked = /already|cannot be regenerated|exists/i.test(err?.message || '');
    if (locked) {
      return { password: '', source: 'generate-locked', error: err.message };
    }
    return { password: '', source: 'generate-failed', error: err.message };
  }
  return { password: '', source: 'generate-empty' };
}

module.exports = {
  deepCollectPasswords,
  pickPasswordCandidate,
  extractPasswordFromGenerateError,
  tryFetchAdvpsPasswordViaGenerate,
};
