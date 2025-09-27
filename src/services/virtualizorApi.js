import querystring from "querystring";

/**
 * Multi-account Virtualizor enduser client.
 * - Searches across multiple panels to resolve a vpsid by IP/hostname.
 * - Caches vpsid -> accountIndex for follow-up calls (getTemplates/reinstall).
 *
 * If your panel uses self-signed certs in DEV, set: NODE_TLS_REJECT_UNAUTHORIZED=0
 */
export class VirtualizorAPI {
  constructor() {
    this.accounts = this._loadAccountsFromEnv();
    if (!this.accounts.length) {
      // Back-compat: fail fast with the same message you had before
      throw new Error("VirtualizorAPI: VIRTUALIZOR_HOST/KEY/PASSWORD missing");
    }

    // Map<vpsid, accountIndex> to route calls to the right panel after a find
    this._vpsAccountCache = new Map();

    // Add logging for loaded accounts
    console.log(`[VirtualizorAPI] Loaded ${this.accounts.length} accounts:`);
    this.accounts.forEach((acct, i) => {
      console.log(`[VirtualizorAPI] Account ${i}: ${acct.host}:${acct.port}`);
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
        out.push({ host, port, key, pass });
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

      const n = Math.min(hosts.length, keys.length, passes.length);
      for (let i = 0; i < n; i++) {
        out.push({
          host: hosts[i],
          key: keys[i],
          pass: passes[i],
          port: ports[i] || 4083,
        });
      }
    }
    if (out.length) return out;

    // 3) Legacy single account
    const host = process.env.VIRTUALIZOR_HOST;
    const key  = process.env.VIRTUALIZOR_API_KEY;
    const pass = process.env.VIRTUALIZOR_API_PASSWORD;
    const port = Number(process.env.VIRTUALIZOR_PORT || 4083);
    if (host && key && pass) {
      out.push({ host, key, pass, port });
    }

    return out;
  }

  // -------------------- low-level per-account call --------------------
  _qsAuth(acct) {
    return `apikey=${encodeURIComponent(acct.key)}&apipass=${encodeURIComponent(acct.pass)}`;
  }

  _baseUrl(acct) {
    return `https://${acct.host}:${acct.port}/index.php?api=json&${this._qsAuth(acct)}`;
  }

  async _call(accountIndex, path, post, retries = 2) {
    const acct = this.accounts[accountIndex];
    if (!acct) throw new Error(`Virtualizor account[${accountIndex}] not found`);

    const url = `${this._baseUrl(acct)}&${path}`;
    console.log(`[VirtualizorAPI][Account ${accountIndex}] Making ${post ? 'POST' : 'GET'} request to: ${acct.host}:${acct.port}`);
    console.log(`[VirtualizorAPI][Account ${accountIndex}] Path: ${path}`);
    if (post) {
      console.log(`[VirtualizorAPI][Account ${accountIndex}] POST data:`, Object.keys(post));
    }

    const init = {
      method: post ? "POST" : "GET",
      headers: post ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: post ? querystring.stringify(post) : undefined,
      cache: "no-store",
      // Add timeout configurations
      signal: AbortSignal.timeout(120000), // 2 minutes timeout
    };

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        console.log(`[VirtualizorAPI][Account ${accountIndex}] Attempt ${attempt}/${retries + 1} - Starting request...`);
        const startTime = Date.now();

        const res = await fetch(url, init);
        const duration = Date.now() - startTime;

        console.log(`[VirtualizorAPI][Account ${accountIndex}] Request completed in ${duration}ms with status: ${res.status}`);

        const text = await res.text();
        console.log(`[VirtualizorAPI][Account ${accountIndex}] Response length: ${text.length} characters`);

        // Log first part of response for debugging
        const preview = text.substring(0, 500);
        console.log(`[VirtualizorAPI][Account ${accountIndex}] Response preview:`, preview);

        let data;
        try {
          data = JSON.parse(text);
          console.log(`[VirtualizorAPI][Account ${accountIndex}] Successfully parsed JSON response`);
        } catch (parseError) {
          console.error(`[VirtualizorAPI][Account ${accountIndex}] JSON parse error:`, parseError.message);
          console.error(`[VirtualizorAPI][Account ${accountIndex}] Raw response:`, text.slice(0, 1000));
          throw new Error(`Virtualizor non-JSON response from ${acct.host}: ${text.slice(0, 300)}`);
        }

        if (!res.ok || data?.error) {
          const err = Array.isArray(data?.error) ? data.error.join("; ") : (data?.error || `HTTP ${res.status}`);
          console.error(`[VirtualizorAPI][Account ${accountIndex}] API Error:`, err);
          throw new Error(`Virtualizor API error from ${acct.host}: ${err}`);
        }

        console.log(`[VirtualizorAPI][Account ${accountIndex}] Request successful`);
        return data;

      } catch (error) {
        console.error(`[VirtualizorAPI][Account ${accountIndex}] Attempt ${attempt} failed:`, error.message);

        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          console.error(`[VirtualizorAPI][Account ${accountIndex}] Request timed out after 2 minutes`);
        }

        if (error.message.includes('504 Gateway Time-out') || error.message.includes('Gateway Time-out')) {
          console.error(`[VirtualizorAPI][Account ${accountIndex}] 504 Gateway timeout detected - server may be overloaded`);
        }

        // If this is the last attempt, throw the error
        if (attempt === retries + 1) {
          console.error(`[VirtualizorAPI][Account ${accountIndex}] All ${retries + 1} attempts failed, giving up`);
          throw new Error(`Virtualizor ${acct.host} failed after ${retries + 1} attempts: ${error.message}`);
        }

        // Wait before retrying (exponential backoff)
        const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
        console.log(`[VirtualizorAPI][Account ${accountIndex}] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // -------------------- helpers to normalize listvs --------------------
  static _valToIps(val) {
    const out = [];
    const push = (x) => { if (x && typeof x === "string") out.push(x.trim()); };

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
    const ips = [
      ...VirtualizorAPI._valToIps(vm?.ips),
      ...VirtualizorAPI._valToIps(vm?.ip),
      ...VirtualizorAPI._valToIps(vm?.ipaddresses),
      ...VirtualizorAPI._valToIps(vm?.primaryip),
      ...VirtualizorAPI._valToIps(vm?.mainip),
      ...VirtualizorAPI._valToIps(vm?.ipv4),
    ].filter(Boolean);

    return { vpsid, hostname, ips: Array.from(new Set(ips)) };
  }

  async _listMyVms(accountIndex) {
    console.log(`[VirtualizorAPI][_listMyVms] Listing VMs for account ${accountIndex}`);
    try {
      const r = await this._call(accountIndex, `act=listvs&page=1&reslen=1000`);
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

  /**
   * Try to find a vpsid across ALL configured accounts, using BOTH ip and hostname when provided.
   * Match order per account:
   *  1) ip + hostname (exact)
   *  2) ip (exact)
   *  3) hostname (exact)
   *  4) if only one VM is visible on that account, pick it
   *
   * Returns the vpsid string. Also caches (vpsid -> accountIndex) for later calls.
   * Returns null ONLY if nothing matched across all accounts.
   */
  async findVpsId(by = {}) {
    const ipIn   = by.ip?.trim();
    const hostIn = by.hostname?.trim()?.toLowerCase();

    console.log(`[VirtualizorAPI][findVpsId] Searching for VPS with IP: ${ipIn}, hostname: ${hostIn}`);

    for (let i = 0; i < this.accounts.length; i++) {
      console.log(`[VirtualizorAPI][findVpsId] Checking account ${i}: ${this.accounts[i].host}`);

      try {
        const vms = await this._listMyVms(i);
        console.log(`[VirtualizorAPI][findVpsId] Account ${i} returned ${vms.length} VMs`);

        if (!vms.length) {
          console.log(`[VirtualizorAPI][findVpsId] Account ${i} has no VMs, skipping`);
          continue;
        }

        // Log all VMs found for debugging
        vms.forEach((vm, idx) => {
          console.log(`[VirtualizorAPI][findVpsId] Account ${i} VM ${idx}: vpsid=${vm.vpsid}, hostname=${vm.hostname}, ips=[${vm.ips.join(', ')}]`);
        });

        const matchIpHost = () => {
          if (!ipIn || !hostIn) return null;
          const m = vms.find(vm => vm.ips.includes(ipIn) && vm.hostname.toLowerCase() === hostIn);
          if (m) console.log(`[VirtualizorAPI][findVpsId] Account ${i} IP+hostname match: ${m.vpsid}`);
          return m?.vpsid || null;
        };

        const matchIp = () => {
          if (!ipIn) return null;
          const m = vms.find(vm => vm.ips.includes(ipIn));
          if (m) console.log(`[VirtualizorAPI][findVpsId] Account ${i} IP match: ${m.vpsid}`);
          return m?.vpsid || null;
        };

        const matchHost = () => {
          if (!hostIn) return null;
          const m = vms.find(vm => vm.hostname.toLowerCase() === hostIn);
          if (m) console.log(`[VirtualizorAPI][findVpsId] Account ${i} hostname match: ${m.vpsid}`);
          return m?.vpsid || null;
        };

        const vpsid =
          matchIpHost() ||
          matchIp()     ||
          matchHost()   ||
          (vms.length === 1 ? vms[0].vpsid : null);

        if (vpsid) {
          console.log(`[VirtualizorAPI][findVpsId] Found VPS ${vpsid} on account ${i}`);
          this._vpsAccountCache.set(vpsid, i);
          return vpsid;
        } else {
          console.log(`[VirtualizorAPI][findVpsId] No matching VPS found on account ${i}`);
        }
      } catch (error) {
        console.error(`[VirtualizorAPI][findVpsId] Error checking account ${i} (${this.accounts[i].host}):`, error.message);
        // Continue checking other accounts
      }
    }

    console.log(`[VirtualizorAPI][findVpsId] No VPS found across all ${this.accounts.length} accounts`);
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

    console.log(`[VirtualizorAPI][_resolveAccountIndexForVps] VPS ${vpsid} not in cache, searching accounts...`);

    // Not in cache (e.g., caller provided a vpsid directly) — search accounts.
    for (let i = 0; i < this.accounts.length; i++) {
      try {
        console.log(`[VirtualizorAPI][_resolveAccountIndexForVps] Checking account ${i}: ${this.accounts[i].host}`);
        const vms = await this._listMyVms(i);
        if (vms.some(vm => vm.vpsid === String(vpsid))) {
          console.log(`[VirtualizorAPI][_resolveAccountIndexForVps] Found VPS ${vpsid} on account ${i}`);
          this._vpsAccountCache.set(vpsid, i);
          return i;
        }
      } catch (error) {
        console.error(`[VirtualizorAPI][_resolveAccountIndexForVps] Error checking account ${i}:`, error.message);
        // Continue checking other accounts
      }
    }

    console.error(`[VirtualizorAPI][_resolveAccountIndexForVps] Could not resolve account for vpsid ${vpsid}`);
    throw new Error(`Virtualizor: could not resolve account for vpsid ${vpsid}`);
  }
}

export default VirtualizorAPI;
