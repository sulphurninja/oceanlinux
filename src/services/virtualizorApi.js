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

  async _call(accountIndex, path, post) {
    const acct = this.accounts[accountIndex];
    if (!acct) throw new Error(`Virtualizor account[${accountIndex}] not found`);

    const url = `${this._baseUrl(acct)}&${path}`;
    const init = {
      method: post ? "POST" : "GET",
      headers: post ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: post ? querystring.stringify(post) : undefined,
      cache: "no-store",
    };
    const res = await fetch(url, init);
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Virtualizor non-JSON response: ${text.slice(0, 300)}`); }

    if (!res.ok || data?.error) {
      const err = Array.isArray(data?.error) ? data.error.join("; ") : (data?.error || `HTTP ${res.status}`);
      throw new Error(err);
    }
    return data;
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
    const r = await this._call(accountIndex, `act=listvs&page=1&reslen=1000`);
    const vsMap = r?.vps || r?.vs || (typeof r === "object" ? r : null);
    if (!vsMap || typeof vsMap !== "object") return [];

    const entries = Object.entries(vsMap).filter(
      ([, v]) => v && typeof v === "object" && (v.vpsid || v.vid || v.subid || v.hostname || v.ip || v.ips)
    );
    return entries.map(VirtualizorAPI._normalizeVm).filter(vm => vm.vpsid);
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

    for (let i = 0; i < this.accounts.length; i++) {
      const vms = await this._listMyVms(i);
      if (!vms.length) continue;

      const matchIpHost = () => {
        if (!ipIn || !hostIn) return null;
        const m = vms.find(vm => vm.ips.includes(ipIn) && vm.hostname.toLowerCase() === hostIn);
        return m?.vpsid || null;
      };

      const matchIp = () => {
        if (!ipIn) return null;
        const m = vms.find(vm => vm.ips.includes(ipIn));
        return m?.vpsid || null;
      };

      const matchHost = () => {
        if (!hostIn) return null;
        const m = vms.find(vm => vm.hostname.toLowerCase() === hostIn);
        return m?.vpsid || null;
      };

      const vpsid =
        matchIpHost() ||
        matchIp()     ||
        matchHost()   ||
        (vms.length === 1 ? vms[0].vpsid : null);

      if (vpsid) {
        this._vpsAccountCache.set(vpsid, i);
        return vpsid;
      }
    }

    return null;
  }

  /**
   * Fetch templates for a vpsid. Figures out which account owns it (from cache,
   * or by searching accounts if not cached).
   */
  async getTemplates(vpsid) {
    const idx = await this._resolveAccountIndexForVps(vpsid);
    return this._call(idx, `svs=${vpsid}&act=ostemplate`);
  }

  /**
   * Reinstall VM with templateId + newPassword on the correct account.
   */
  async reinstall(vpsid, templateId, newPassword) {
    const idx = await this._resolveAccountIndexForVps(vpsid);
    const post = {
      newos: String(templateId),
      newpass: newPassword,
      conf: newPassword,
      reinsos: "Reinstall",
    };
    return this._call(idx, `svs=${vpsid}&act=ostemplate`, post);
  }

  // -------------------- helpers --------------------
  async _resolveAccountIndexForVps(vpsid) {
    if (this._vpsAccountCache.has(vpsid)) {
      return this._vpsAccountCache.get(vpsid);
    }

    // Not in cache (e.g., caller provided a vpsid directly) — search accounts.
    for (let i = 0; i < this.accounts.length; i++) {
      const vms = await this._listMyVms(i);
      if (vms.some(vm => vm.vpsid === String(vpsid))) {
        this._vpsAccountCache.set(vpsid, i);
        return i;
      }
    }
    throw new Error(`Virtualizor: could not resolve account for vpsid ${vpsid}`);
  }
}

export default VirtualizorAPI;
