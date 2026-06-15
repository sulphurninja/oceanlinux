import querystring from "querystring";
import https from "https";

/** Fast fail for listvs / find / template listing — dead panels must not block the request. */
const TIMEOUT_LIST_MS = 20000;
/** Reinstall can take longer on the Virtualizor side. */
const TIMEOUT_REINSTALL_MS = 90000;
/** Default for power actions and misc calls. */
const TIMEOUT_DEFAULT_MS = 45000;

/**
 * Multi-account Virtualizor enduser client.
 * - Searches across multiple panels to resolve a vpsid by IP/hostname.
 * - Caches vpsid -> accountIndex for follow-up calls (getTemplates/reinstall).
 *
 * SSL certificate validation is disabled for servers with self-signed certificates.
 */
export class VirtualizorAPI {
  /**
   * @param {{ accounts?: Array<{ host: string; port?: number; key: string; pass: string; protocol?: 'http'|'https' }> }} [opts]
   * Pass `accounts` to use an explicit set of panels (e.g. a single per-company
   * panel pulled from the DB). When omitted, accounts are loaded from env vars
   * for back-compat with the multi-panel admin setup.
   */
  constructor(opts = {}) {
    if (Array.isArray(opts?.accounts) && opts.accounts.length > 0) {
      this.accounts = opts.accounts
        .filter(a => a && a.host && a.key && a.pass)
        .map(a => ({
          host: a.host,
          port: Number(a.port || 4083),
          key: a.key,
          pass: a.pass,
          protocol: a.protocol || 'https',
        }));
    } else {
      this.accounts = this._loadAccountsFromEnv();
    }

    if (!this.accounts.length) {
      // Back-compat: fail fast with the same message you had before
      throw new Error("VirtualizorAPI: VIRTUALIZOR_HOST/KEY/PASSWORD missing");
    }

    // Map<vpsid, accountIndex> to route calls to the right panel after a find
    this._vpsAccountCache = new Map();

    // Add logging for loaded accounts
    console.log(`[VirtualizorAPI] Loaded ${this.accounts.length} accounts:`);
    this.accounts.forEach((acct, i) => {
      console.log(`[VirtualizorAPI] Account ${i}: ${acct.protocol}://${acct.host}:${acct.port}`);
    });
  }

  // -------------------- env parsing --------------------
  _loadAccountsFromEnv() {
    const out = [];

    // 1) Indexed vars: VIRTUALIZOR_HOST_1, _2, _3...
    for (let i = 1; i <= 10; i++) {
      const host = process.env[`VIRTUALIZOR_HOST_${i}`];
      const key  = process.env[`VIRTUALIZOR_API_KEY_${i}`];
      const pass = process.env[`VIRTUALIZOR_API_PASSWORD_${i}`];
      if (host && key && pass) {
        const port = Number(process.env[`VIRTUALIZOR_PORT_${i}`] || 4083);
        const protocol = process.env[`VIRTUALIZOR_PROTOCOL_${i}`] || 'https';
        out.push({ host, port, key, pass, protocol });
      }
    }
    if (out.length) return out;

    // 2) Comma-separated lists
    const hostsCsv = process.env.VIRTUALIZOR_HOSTS;
    const keysCsv  = process.env.VIRTUALIZOR_API_KEYS;
    const passCsv  = process.env.VIRTUALIZOR_API_PASSWORDS;
    if (hostsCsv && keysCsv && passCsv) {
      const hosts = hostsCsv.split(",").map(s => s.trim()).filter(Boolean);
      const keys  = keysCsv.split(",").map(s => s.trim()).filter(Boolean);
      const passes= passCsv.split(",").map(s => s.trim()).filter(Boolean);
      const ports = (process.env.VIRTUALIZOR_PORTS || "")
        .split(",")
        .map(s => s.trim())
        .map(s => Number(s || 4083));
      const protocols = (process.env.VIRTUALIZOR_PROTOCOLS || "")
        .split(",")
        .map(s => s.trim().toLowerCase() || 'https');

      const n = Math.min(hosts.length, keys.length, passes.length);
      for (let i = 0; i < n; i++) {
        out.push({
          host: hosts[i],
          key: keys[i],
          pass: passes[i],
          port: ports[i] || 4083,
          protocol: protocols[i] || 'https',
        });
      }
    }
    if (out.length) return out;

    // 3) Legacy single account
    const host = process.env.VIRTUALIZOR_HOST;
    const key  = process.env.VIRTUALIZOR_API_KEY;
    const pass = process.env.VIRTUALIZOR_API_PASSWORD;
    const port = Number(process.env.VIRTUALIZOR_PORT || 4083);
    const protocol = process.env.VIRTUALIZOR_PROTOCOL || 'https';
    if (host && key && pass) {
      out.push({ host, key, pass, port, protocol });
    }

    return out;
  }

  // -------------------- low-level per-account call --------------------
  _qsAuth(acct) {
    return `apikey=${encodeURIComponent(acct.key)}&apipass=${encodeURIComponent(acct.pass)}`;
  }

  _baseUrl(acct) {
    const protocol = acct.protocol || 'https';
    return `${protocol}://${acct.host}:${acct.port}/index.php?api=json&${this._qsAuth(acct)}`;
  }

  async _call(accountIndex, path, post, callOpts = {}) {
    const acct = this.accounts[accountIndex];
    if (!acct) throw new Error(`Virtualizor account[${accountIndex}] not found`);

    // Back-compat: _call(idx, path, post, 2) where 4th arg was retry count.
    const opts = typeof callOpts === 'number'
      ? { retries: callOpts }
      : (callOpts || {});

    const isListOrTemplateGet = !post && (
      path.includes('act=listvs') ||
      path.includes('act=ostemplate')
    );
    const timeoutMs = opts.timeoutMs ?? (
      post && path.includes('act=ostemplate') ? TIMEOUT_REINSTALL_MS
        : isListOrTemplateGet ? TIMEOUT_LIST_MS
        : TIMEOUT_DEFAULT_MS
    );
    const retries = opts.retries ?? (isListOrTemplateGet ? 0 : 1);

    const url = `${this._baseUrl(acct)}&${path}`;
    console.log(`[VirtualizorAPI][Account ${accountIndex}] Making ${post ? 'POST' : 'GET'} request to: ${acct.host}:${acct.port} (timeout=${timeoutMs}ms, retries=${retries})`);
    console.log(`[VirtualizorAPI][Account ${accountIndex}] Path: ${path}`);
    if (post) {
      console.log(`[VirtualizorAPI][Account ${accountIndex}] POST data:`, Object.keys(post));
    }

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        console.log(`[VirtualizorAPI][Account ${accountIndex}] Attempt ${attempt}/${retries + 1} - Starting request...`);
        const startTime = Date.now();

        const data = await this._makeHttpsRequest(url, post, accountIndex, timeoutMs);
        const duration = Date.now() - startTime;

        console.log(`[VirtualizorAPI][Account ${accountIndex}] Request completed in ${duration}ms`);
        return data;

      } catch (error) {
        console.error(`[VirtualizorAPI][Account ${accountIndex}] Attempt ${attempt} failed:`, error.message);

        if (error.message.includes('timeout')) {
          console.error(`[VirtualizorAPI][Account ${accountIndex}] Request timed out after ${timeoutMs}ms`);
        }

        if (attempt === retries + 1) {
          throw new Error(`Virtualizor ${acct.host} failed after ${retries + 1} attempts: ${error.message}`);
        }

        const waitTime = Math.min(2000 * attempt, 5000);
        console.log(`[VirtualizorAPI][Account ${accountIndex}] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Make HTTPS request using native Node.js https module with SSL certificate bypass
   * This works around Next.js fetch() not supporting custom agents
   */
  _makeHttpsRequest(url, postData, accountIndex, timeoutMs = TIMEOUT_DEFAULT_MS) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const postBody = postData ? querystring.stringify(postData) : null;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: postData ? 'POST' : 'GET',
        headers: {
          'User-Agent': 'OceanLinux-VirtualizorClient/1.0',
          ...(postData && {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postBody)
          })
        },
        rejectUnauthorized: false, // BYPASS SSL CERTIFICATE VALIDATION FOR SELF-SIGNED CERTS
        timeout: timeoutMs,
      };

      console.log(`[VirtualizorAPI][Account ${accountIndex}] Using native HTTPS with SSL bypass (rejectUnauthorized: false)`);

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            console.log(`[VirtualizorAPI][Account ${accountIndex}] Response status: ${res.statusCode}`);
            console.log(`[VirtualizorAPI][Account ${accountIndex}] Response length: ${data.length} characters`);
            console.log(`[VirtualizorAPI][Account ${accountIndex}] Response preview:`, data.substring(0, 500));

            const jsonData = JSON.parse(data);
            console.log(`[VirtualizorAPI][Account ${accountIndex}] Successfully parsed JSON response`);

            if (res.statusCode >= 400 || jsonData?.error) {
              const err = Array.isArray(jsonData?.error) 
                ? jsonData.error.join("; ") 
                : (jsonData?.error || `HTTP ${res.statusCode}`);
              console.error(`[VirtualizorAPI][Account ${accountIndex}] API Error:`, err);
              reject(new Error(`Virtualizor API error: ${err}`));
            } else {
              resolve(jsonData);
            }
          } catch (parseError) {
            console.error(`[VirtualizorAPI][Account ${accountIndex}] JSON parse error:`, parseError.message);
            console.error(`[VirtualizorAPI][Account ${accountIndex}] Raw response:`, data.slice(0, 1000));
            reject(new Error(`Virtualizor non-JSON response: ${data.slice(0, 300)}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[VirtualizorAPI][Account ${accountIndex}] Request error:`, error.message);
        console.error(`[VirtualizorAPI][Account ${accountIndex}] Error code:`, error.code);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      });

      if (postBody) {
        req.write(postBody);
      }

      req.end();
    });
  }

  // -------------------- helpers to normalize listvs --------------------
  static _valToIps(val) {
    const out = [];
    // Strip port from IP address if present (e.g., "192.168.1.1:49965" -> "192.168.1.1")
    const push = (x) => { 
      if (x && typeof x === "string") {
        const cleanIp = x.trim().split(':')[0]; // Remove port if present
        out.push(cleanIp);
      }
    };

    if (!val) return out;
    if (typeof val === "string") { push(val); return out; }

    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string") push(v);
        else if (v && typeof v === "object") push(v.ip || v.address || v.mainip);
      }
      return out;
    }

    if (typeof val === "object") {
      for (const v of Object.values(val)) {
        if (typeof v === "string") push(v);
        else if (v && typeof v === "object") push(v.ip || v.address || v.mainip);
      }
    }
    return out;
  }

  static _normalizeVm([key, vm]) {
    const vpsid = String(vm?.vpsid ?? vm?.vid ?? vm?.subid ?? key ?? "");
    const hostname = (vm?.hostname || vm?.host || vm?.name || "").toString().trim();
    const virt = (vm?.virt || vm?.virt_type || vm?.virtualization || "").toString().trim().toLowerCase();
    const ips = [
      ...VirtualizorAPI._valToIps(vm?.ips),
      ...VirtualizorAPI._valToIps(vm?.ip),
      ...VirtualizorAPI._valToIps(vm?.ipaddresses),
      ...VirtualizorAPI._valToIps(vm?.primaryip),
      ...VirtualizorAPI._valToIps(vm?.mainip),
      ...VirtualizorAPI._valToIps(vm?.ipv4),
    ].filter(Boolean);

    return { vpsid, hostname, virt, ips: Array.from(new Set(ips)) };
  }

  async _listMyVms(accountIndex, callOpts = {}) {
    console.log(`[VirtualizorAPI][_listMyVms] Listing VMs for account ${accountIndex}`);
    try {
      const r = await this._call(accountIndex, `act=listvs&page=1&reslen=1000`, null, callOpts);
      const vsMap = r?.vps || r?.vs || (typeof r === "object" ? r : null);

      if (!vsMap || typeof vsMap !== "object") {
        console.log(`[VirtualizorAPI][_listMyVms] No VMs found for account ${accountIndex}`);
        return [];
      }

      const entries = Object.entries(vsMap).filter(
        ([, v]) => v && typeof v === "object" && (v.vpsid || v.vid || v.subid || v.hostname || v.ip || v.ips)
      );

      const vms = entries.map(VirtualizorAPI._normalizeVm).filter(vm => vm.vpsid);
      console.log(`[VirtualizorAPI][_listMyVms] Found ${vms.length} VMs for account ${accountIndex}`);

      return vms;
    } catch (error) {
      console.error(`[VirtualizorAPI][_listMyVms] Error listing VMs for account ${accountIndex}:`, error.message);
      throw error;
    }
  }

  // -------------------- public API --------------------

  _matchVpsInList(vms, ipIn, hostIn) {
    if (!vms?.length) return null;

    const matchIpHost = () => {
      if (!ipIn || !hostIn) return null;
      return vms.find(vm => vm.ips.includes(ipIn) && vm.hostname.toLowerCase() === hostIn) || null;
    };
    const matchIp = () => {
      if (!ipIn) return null;
      return vms.find(vm => vm.ips.includes(ipIn)) || null;
    };
    const matchHost = () => {
      if (!hostIn) return null;
      return vms.find(vm => vm.hostname.toLowerCase() === hostIn) || null;
    };

    return matchIpHost() || matchIp() || matchHost() || (vms.length === 1 ? vms[0] : null);
  }

  /**
   * Try to find a vpsid across ALL configured accounts, using BOTH ip and hostname when provided.
   * Panels are queried in parallel so dead/unreachable Hostycare Virtualizor nodes do not
   * block the request for minutes before the working panel is tried.
   */
  async findVpsId(by = {}) {
    const ipRaw  = by.ip?.trim();
    const ipIn   = ipRaw ? ipRaw.split(':')[0] : null;
    const hostIn = by.hostname?.trim()?.toLowerCase();

    console.log(`[VirtualizorAPI][findVpsId] Searching for VPS with IP: ${ipIn}${ipRaw !== ipIn ? ` (stripped from ${ipRaw})` : ''}, hostname: ${hostIn}`);

    const listOpts = { timeoutMs: TIMEOUT_LIST_MS, retries: 0 };
    const settled = await Promise.allSettled(
      this.accounts.map((acct, i) =>
        this._listMyVms(i, listOpts).then(vms => ({ i, acct, vms }))
      )
    );

    for (const entry of settled) {
      if (entry.status !== 'fulfilled') {
        const reason = entry.reason?.message || String(entry.reason);
        console.warn(`[VirtualizorAPI][findVpsId] Panel lookup failed: ${reason}`);
        continue;
      }

      const { i, acct, vms } = entry.value;
      console.log(`[VirtualizorAPI][findVpsId] Account ${i} (${acct.host}) returned ${vms.length} VMs`);

      const matched = this._matchVpsInList(vms, ipIn, hostIn);
      if (matched?.vpsid) {
        console.log(`[VirtualizorAPI][findVpsId] Found VPS ${matched.vpsid} on account ${i}`);
        this._vpsAccountCache.set(matched.vpsid, i);
        return { vpsid: matched.vpsid, virt: matched.virt || null };
      }
    }

    console.log(`[VirtualizorAPI][findVpsId] No VPS found across ${this.accounts.length} accounts`);
    return null;
  }

  /**
   * Fetch templates for a vpsid. Figures out which account owns it (from cache,
   * or by searching accounts if not cached).
   */
  async getTemplates(vpsid) {
    console.log(`[VirtualizorAPI][getTemplates] Getting templates for VPS: ${vpsid}`);
    const idx = await this._resolveAccountIndexForVps(vpsid);
    console.log(`[VirtualizorAPI][getTemplates] Using account ${idx}: ${this.accounts[idx].host}`);

    try {
      const result = await this._call(idx, `svs=${vpsid}&act=ostemplate`);
      console.log(`[VirtualizorAPI][getTemplates] Successfully retrieved templates for VPS ${vpsid}`);
      return result;
    } catch (error) {
      console.error(`[VirtualizorAPI][getTemplates] Failed to get templates for VPS ${vpsid}:`, error.message);
      throw error;
    }
  }

  /**
   * Power actions on the correct account. Virtualizor's enduser API uses a
   * two-step "confirm" flow for power actions: a plain GET to act=stop only
   * returns the confirmation page (HTTP 200 with `act:"stop"` echoed back but
   * NO actual effect on the VM). To actually execute, we have to POST a body
   * containing `do=1` (the confirmation token). Without this, the VPS visibly
   * doesn't change state even though the API call appears successful.
   *
   * Note: this only runs for the company-Virtualizor automation path. The
   * Hostycare flow handles power actions via HostycareAPI directly and is
   * not affected.
   */
  async start(vpsid) {
    const idx = await this._resolveAccountIndexForVps(vpsid);
    return this._call(idx, `svs=${vpsid}&act=start`, { do: 1 });
  }

  async stop(vpsid) {
    const idx = await this._resolveAccountIndexForVps(vpsid);
    return this._call(idx, `svs=${vpsid}&act=stop`, { do: 1 });
  }

  async restart(vpsid) {
    const idx = await this._resolveAccountIndexForVps(vpsid);
    return this._call(idx, `svs=${vpsid}&act=restart`, { do: 1 });
  }

  async reboot(vpsid) {
    return this.restart(vpsid);
  }

  /**
   * Read power state from a Virtualizor listvs VM row (0/1 or running/stopped).
   */
  static extractVpsPowerCandidate(vm) {
    if (!vm || typeof vm !== 'object') return null;
    for (const value of [vm.status, vm.state, vm.running, vm.power, vm.vps_status, vm.cached_status]) {
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  static normalizeVpsPowerState(raw) {
    if (raw === undefined || raw === null || raw === '') return 'unknown';
    if (typeof raw === 'string') {
      const s = raw.toLowerCase().trim();
      if (['1', 'running', 'on', 'online', 'started', 'powered_on'].includes(s)) return 'running';
      if (['0', 'stopped', 'off', 'offline', 'shutdown', 'shutoff', 'powered_off'].includes(s)) return 'stopped';
      if (['suspended', 'paused'].includes(s)) return 'suspended';
      if (['installing', 'rebooting', 'starting', 'stopping', 'busy'].includes(s)) return 'busy';
      return 'unknown';
    }
    if (typeof raw === 'number') return raw === 1 ? 'running' : 'stopped';
    if (typeof raw === 'boolean') return raw ? 'running' : 'stopped';
    if (typeof raw === 'object') {
      const candidate = raw.status ?? raw.state ?? raw.running ?? raw.power ?? raw.vps_status;
      if (candidate !== undefined) return VirtualizorAPI.normalizeVpsPowerState(candidate);
    }
    return 'unknown';
  }

  /**
   * Resolve live VPS power from Virtualizor listvs — never uses ping.
   */
  async resolveVpsPowerState(vpsid) {
    const vmRecord = await this.getVpsRecord(vpsid);
    if (!vmRecord) {
      return { powerState: 'unknown', rawStatus: null, source: 'none', vmRecord: null };
    }
    const rawStatus = VirtualizorAPI.extractVpsPowerCandidate(vmRecord);
    return {
      powerState: VirtualizorAPI.normalizeVpsPowerState(rawStatus),
      rawStatus,
      source: 'listvs',
      vmRecord,
    };
  }

  /**
   * Locate a VPS across known accounts and return the raw VM record (incl. status).
   * Used by service-action 'status' for company-Virtualizor automation.
   */
  async getVpsRecord(vpsid) {
    const idx = await this._resolveAccountIndexForVps(vpsid);
    try {
      const r = await this._call(idx, `act=listvs&page=1&reslen=1000`);
      const vsMap = r?.vps || r?.vs || (typeof r === 'object' ? r : null);
      if (!vsMap || typeof vsMap !== 'object') return null;
      for (const [key, vm] of Object.entries(vsMap)) {
        if (!vm || typeof vm !== 'object') continue;
        const id = String(vm.vpsid ?? vm.vid ?? vm.subid ?? key ?? '');
        if (id === String(vpsid)) return vm;
      }
      return null;
    } catch (err) {
      console.error(`[VirtualizorAPI][getVpsRecord] Failed for vpsid=${vpsid}:`, err.message);
      return null;
    }
  }

  /**
   * Reinstall VM with templateId + newPassword on the correct account.
   */
  async reinstall(vpsid, templateId, newPassword) {
    console.log(`[VirtualizorAPI][reinstall] Starting reinstall for VPS: ${vpsid}, template: ${templateId}`);
    const idx = await this._resolveAccountIndexForVps(vpsid);
    console.log(`[VirtualizorAPI][reinstall] Using account ${idx}: ${this.accounts[idx].host}`);

    const post = {
      newos: String(templateId),
      newpass: newPassword,
      conf: newPassword,
      reinsos: "Reinstall",
    };

    console.log(`[VirtualizorAPI][reinstall] POST parameters prepared:`, {
      ...post,
      newpass: '[HIDDEN]',
      conf: '[HIDDEN]'
    });

    try {
      const result = await this._call(idx, `svs=${vpsid}&act=ostemplate`, post);
      console.log(`[VirtualizorAPI][reinstall] Reinstall request completed for VPS ${vpsid}`);
      return result;
    } catch (error) {
      console.error(`[VirtualizorAPI][reinstall] Failed to reinstall VPS ${vpsid}:`, error.message);
      throw error;
    }
  }

  // -------------------- helpers --------------------
  async _resolveAccountIndexForVps(vpsid) {
    if (this._vpsAccountCache.has(vpsid)) {
      const idx = this._vpsAccountCache.get(vpsid);
      console.log(`[VirtualizorAPI][_resolveAccountIndexForVps] Found VPS ${vpsid} in cache for account ${idx}`);
      return idx;
    }

    console.log(`[VirtualizorAPI][_resolveAccountIndexForVps] VPS ${vpsid} not in cache, searching accounts in parallel...`);

    const listOpts = { timeoutMs: TIMEOUT_LIST_MS, retries: 0 };
    const settled = await Promise.allSettled(
      this.accounts.map((_, i) =>
        this._listMyVms(i, listOpts).then(vms => ({ i, vms }))
      )
    );

    for (const entry of settled) {
      if (entry.status !== 'fulfilled') continue;
      const { i, vms } = entry.value;
      if (vms.some(vm => vm.vpsid === String(vpsid))) {
        console.log(`[VirtualizorAPI][_resolveAccountIndexForVps] Found VPS ${vpsid} on account ${i}`);
        this._vpsAccountCache.set(vpsid, i);
        return i;
      }
    }

    throw new Error(`Virtualizor: could not resolve account for vpsid ${vpsid}`);
  }
}

export default VirtualizorAPI;
