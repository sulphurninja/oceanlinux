/**
 * KuroHost Cloud Platform REST client.
 * Docs: https://kurohost.com/cloud/docs/api
 *
 * Auth: Authorization: Bearer kuro_<secret>
 * Base:  /api/cloud/v1
 */

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_MS = 4_000;
const DEFAULT_JOB_WAIT_MS = 300_000;

class KurohostApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'KurohostApiError';
    this.status = status;
    this.body = body;
  }
}

class KurohostApi {
  /**
   * @param {Object} cfg
   * @param {string} cfg.baseUrl
   * @param {string} cfg.apiKey   Bearer token (kuro_…)
   * @param {string} [cfg.label]
   * @param {number} [cfg.timeoutMs]
   */
  constructor(cfg = {}) {
    this.baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '');
    this.apiKey = String(cfg.apiKey || '').trim();
    this.label = cfg.label || '';
    this.timeoutMs = Number(cfg.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (!this.baseUrl || !this.apiKey) {
      throw new Error('KurohostApi: baseUrl and apiKey are required');
    }
  }

  _headers({ json = true } = {}) {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async _request(method, path, { body, query } = {}) {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== '') url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: this._headers({ json: body != null }),
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        throw new KurohostApiError(msg, { status: res.status, body: data });
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new KurohostApiError('Request timed out', { status: 504 });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ----------------------------- catalog -----------------------------

  listZones() {
    return this._request('GET', '/zones');
  }

  listFlavors() {
    return this._request('GET', '/flavors');
  }

  listOsTemplates(query) {
    return this._request('GET', '/os-templates', { query });
  }

  listNetworkSpeedRates(cloudZoneId) {
    return this._request('GET', '/network-speed-rates', {
      query: cloudZoneId ? { cloudZoneId } : undefined,
    });
  }

  // ----------------------------- instances -----------------------------

  listInstances() {
    return this._request('GET', '/instances');
  }

  getInstance(instanceId) {
    return this._request('GET', `/instances/${encodeURIComponent(instanceId)}`);
  }

  createInstance(body) {
    return this._request('POST', '/instances', { body });
  }

  updateInstance(instanceId, body) {
    return this._request('PATCH', `/instances/${encodeURIComponent(instanceId)}`, { body });
  }

  terminateInstance(instanceId) {
    return this._request('DELETE', `/instances/${encodeURIComponent(instanceId)}`);
  }

  startInstance(instanceId) {
    return this._request('POST', `/instances/${encodeURIComponent(instanceId)}/actions/start`);
  }

  stopInstance(instanceId) {
    return this._request('POST', `/instances/${encodeURIComponent(instanceId)}/actions/stop`);
  }

  rebootInstance(instanceId) {
    return this._request('POST', `/instances/${encodeURIComponent(instanceId)}/actions/reboot`);
  }

  /**
   * Reinstall / change OS — destroys guest disk, clones from template (IP kept).
   * @param {string} instanceId
   * @param {{ osTemplateId: string, password: string }} body
   */
  reinstallInstance(instanceId, body) {
    return this._request('POST', `/instances/${encodeURIComponent(instanceId)}/actions/reinstall`, {
      body: {
        osTemplateId: String(body?.osTemplateId || '').trim(),
        password: String(body?.password || ''),
      },
    });
  }

  // ----------------------------- jobs -----------------------------

  getJob(jobId) {
    return this._request('GET', `/jobs/${encodeURIComponent(jobId)}`);
  }

  listJobs(query) {
    return this._request('GET', '/jobs', { query });
  }

  async waitForJob(jobId, {
    maxWaitMs = DEFAULT_JOB_WAIT_MS,
    pollIntervalMs = DEFAULT_POLL_MS,
  } = {}) {
    const deadline = Date.now() + maxWaitMs;
    let last = null;

    while (Date.now() < deadline) {
      const res = await this.getJob(jobId);
      const job = res?.job || res;
      last = job;
      const status = String(job?.status || '').toUpperCase();

      if (status === 'SUCCEEDED') return job;
      if (status === 'FAILED' || status === 'CANCELED') {
        throw new KurohostApiError(
          job?.errorMessage || `Job ${status}`,
          { status: 502, body: job }
        );
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new KurohostApiError(
      `Job ${jobId} did not complete within ${Math.round(maxWaitMs / 1000)}s`,
      { status: 504, body: last }
    );
  }

  /** Cheap auth probe — list zones. */
  async test() {
    try {
      const res = await this.listZones();
      const count = Array.isArray(res?.items) ? res.items.length : 0;
      return {
        ok: true,
        message: `Connected to KuroHost Cloud (${count} zone${count === 1 ? '' : 's'}).`,
        zoneCount: count,
      };
    } catch (err) {
      return {
        ok: false,
        message: err.message || 'Connection failed',
        status: err.status || 502,
      };
    }
  }

  // ----------------------------- helpers -----------------------------

  static unwrapInstance(res) {
    return res?.instance || res?.items?.[0] || res || null;
  }

  static extractInstanceIp(instance) {
    if (!instance) return '';
    if (instance.primaryIp) return String(instance.primaryIp).trim();
    const vpsIp = instance.vpsService?.ipAddress?.address;
    if (vpsIp) return String(vpsIp).trim();
    const ips = instance.ips || instance.ipAddresses || [];
    for (const row of ips) {
      const addr = row?.ipAddress?.address || row?.address || row?.ip;
      if (addr) return String(addr).trim();
    }
    return '';
  }

  static extractCredentials(instance) {
    if (!instance) return { username: '', password: '' };
    const creds = instance.credentials || instance.access || instance.login || {};
    const vps = instance.vpsService || {};
    const username =
      instance.username ||
      instance.rootUsername ||
      vps.ciuser ||
      creds.username ||
      creds.user ||
      (instance?.osTemplate?.isWindows || vps.osTemplateName?.toLowerCase?.().includes('windows')
        ? 'Administrator'
        : 'root');
    const password =
      instance.password ||
      instance.rootPassword ||
      creds.password ||
      creds.rootPassword ||
      '';
    return { username: String(username || 'root'), password: String(password || '') };
  }

  static mapPowerState(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'RUNNING') return 'running';
    if (s === 'STOPPED' || s === 'SUSPENDED') return 'stopped';
    if (s === 'PROVISIONING' || s === 'QUEUED') return 'provisioning';
    if (s === 'TERMINATED') return 'terminated';
    return 'unknown';
  }

  static resolveOsTemplateId(templates, { preferredName, isWindows } = {}) {
    const items = Array.isArray(templates) ? templates : (templates?.items || []);
    if (!items.length) return '';

    const pref = String(preferredName || '').trim().toLowerCase();
    if (pref) {
      const hit = items.find((t) => String(t.name || '').toLowerCase().includes(pref));
      if (hit?.id) return hit.id;
    }

    const filtered = items.filter((t) => !!t.isWindows === !!isWindows);
    const pool = filtered.length ? filtered : items;
    return pool[0]?.id || '';
  }
}

module.exports = KurohostApi;
module.exports.KurohostApiError = KurohostApiError;
