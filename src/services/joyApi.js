/**
 * Joy Services instances API client (https://docs.joy.services/instance-api/).
 *
 * MANAGE-ONLY provider: the Joy `/api/connect` endpoint only exposes read info
 * (dashboardinfo / account_info / machine_list / machine_info) and power actions
 * (change_machine_state). There is NO buy/create/provision endpoint, so Joy
 * machines are created in the Joy panel and we only power-manage them here.
 *
 * One instance is bound to a single (baseUrl, apiToken, apiKey) tuple — i.e.
 * one company configuration. Auth is two static headers (x-api-token +
 * x-api-key) on every POST, so there's no token lifecycle to manage.
 *
 * Quirks handled here (documented by Joy):
 *   - `success` may be the string "true"/"false" OR a real boolean, depending
 *     on the operation → `isSuccess()` coerces both.
 *   - The body may arrive as a JSON-encoded string (double-encoded) → we parse
 *     once and, if we still have a string, parse again.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

const JOY_POWER_STATES = Object.freeze([
  'start',
  'shutdown',
  'force_shutdown',
  'reboot',
  'force_reboot',
  'pause',
  'hibernate',
  'resume',
]);

function trimSlash(s) {
  return (s || '').replace(/\/+$/, '');
}

class JoyApiError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message);
    this.name = 'JoyApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

class JoyApi {
  /**
   * @param {Object} cfg
   * @param {string} cfg.baseUrl  e.g. https://api.joy.services
   * @param {string} cfg.apiToken x-api-token header value
   * @param {string} cfg.apiKey   x-api-key header value
   * @param {string} [cfg.initIp]      forwarded as init_ip in the body
   * @param {string} [cfg.initBrowser] forwarded as init_browser in the body
   */
  constructor(cfg = {}) {
    this.baseUrl = trimSlash(cfg.baseUrl || 'https://api.joy.services');
    this.apiToken = cfg.apiToken || '';
    this.apiKey = cfg.apiKey || '';
    this.initIp = cfg.initIp || '127.0.0.1';
    this.initBrowser = cfg.initBrowser || 'joyconnect';

    if (!this.apiToken || !this.apiKey) {
      throw new JoyApiError('Joy API credentials missing (apiToken/apiKey)', { code: 'NO_CREDENTIALS' });
    }
  }

  /** Coerce Joy's mixed string/boolean success flag into a real boolean. */
  static isSuccess(data) {
    if (!data || typeof data !== 'object') return false;
    return data.success === true || data.success === 'true';
  }

  /** Some Joy layers double-encode the JSON body — parse once more if needed. */
  static safeParse(raw) {
    let parsed = raw;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (_) { return {}; }
    }
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (_) { return {}; }
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  async request(type, extra = {}) {
    const url = `${this.baseUrl}/api/connect/`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'joyconnect',
          'x-api-token': this.apiToken,
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          type,
          init_ip: this.initIp,
          init_browser: this.initBrowser,
          ...extra,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new JoyApiError('Joy API request timed out', { code: 'TIMEOUT' });
      }
      throw new JoyApiError(`Joy API request failed: ${err.message}`, { code: 'NETWORK' });
    }
    clearTimeout(timer);

    const rawText = await res.text().catch(() => '');
    const data = JoyApi.safeParse(rawText);

    if (!res.ok) {
      throw new JoyApiError(
        data.message || data.error || `Joy API HTTP ${res.status}`,
        { status: res.status, body: data, code: data.error || 'HTTP_ERROR' }
      );
    }

    if (!JoyApi.isSuccess(data)) {
      throw new JoyApiError(
        data.message || data.error || 'Joy API request was not successful',
        { status: res.status, body: data, code: data.error || 'NOT_SUCCESS' }
      );
    }

    return data;
  }

  dashboardInfo() {
    return this.request('dashboardinfo');
  }

  accountInfo() {
    return this.request('account_info');
  }

  /** Returns the raw `value` array of machines. */
  async machineList() {
    const data = await this.request('machine_list');
    return Array.isArray(data.value) ? data.value : [];
  }

  machineInfo(instanceToken) {
    return this.request('machine_info', { instance_token: instanceToken });
  }

  /**
   * @param {string} instanceToken ihash of the machine
   * @param {string} machineState one of JOY_POWER_STATES
   */
  changeMachineState(instanceToken, machineState) {
    const state = String(machineState || '').toLowerCase();
    if (!JOY_POWER_STATES.includes(state)) {
      throw new JoyApiError(`Unsupported Joy machine_state "${machineState}"`, { code: 'INVALID_STATE' });
    }
    return this.request('change_machine_state', {
      instance_token: instanceToken,
      machine_state: state,
    });
  }

  /**
   * Find a machine record by its IP address (Joy has no per-order service id,
   * so IP is the join key between an OceanLinux order and a Joy machine).
   * Returns the machine object (incl. `ihash`) or null.
   */
  async findMachineByIp(ip) {
    if (!ip) return null;
    const target = String(ip).trim();
    const machines = await this.machineList();
    return (
      machines.find((m) => String(m.ip || '').trim() === target) || null
    );
  }

  /** Cheap auth probe used by the admin "Test connection" button. */
  async test() {
    const data = await this.accountInfo();
    return {
      ok: true,
      username: data.username || null,
      email: data.email || null,
      amount: data.amount || null,
    };
  }
}

JoyApi.POWER_STATES = JOY_POWER_STATES;
JoyApi.JoyApiError = JoyApiError;

module.exports = JoyApi;
module.exports.JoyApi = JoyApi;
module.exports.JoyApiError = JoyApiError;
module.exports.JOY_POWER_STATES = JOY_POWER_STATES;
