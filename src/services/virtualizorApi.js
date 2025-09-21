import querystring from "querystring";

/**
 * NOTE on TLS:
 * - If your Virtualizor panel has a proper cert, you don’t need to do anything.
 * - If it’s self-signed/mismatched in DEV ONLY, set env:
 *     NODE_TLS_REJECT_UNAUTHORIZED=0
 *   (This disables TLS verification globally; don’t use in prod.)
 */

export class VirtualizorAPI {
  constructor() {
    this.host = process.env.VIRTUALIZOR_HOST;
    this.port = Number(process.env.VIRTUALIZOR_PORT || 4083);
    this.key = process.env.VIRTUALIZOR_API_KEY;
    this.pass = process.env.VIRTUALIZOR_API_PASSWORD;

    if (!this.host || !this.key || !this.pass) {
      throw new Error("VirtualizorAPI: VIRTUALIZOR_HOST/KEY/PASSWORD missing");
    }
  }

  qsAuth() {
    // Enduser auth: apikey + apipass
    return `apikey=${encodeURIComponent(this.key)}&apipass=${encodeURIComponent(this.pass)}`;
  }

  baseUrl() {
    // If your panel doesn’t support JSON, change to api=serialize and add a PHP-serialize parser.
    return `https://${this.host}:${this.port}/index.php?api=json&${this.qsAuth()}`;
  }

  async call(path, post) {
    const url = `${this.baseUrl()}&${path}`;
    const init = {
      method: post ? "POST" : "GET",
      headers: post ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: post ? querystring.stringify(post) : undefined,
      // Undici (Next.js fetch) ignores Node "agent"; for self-signed, use NODE_TLS_REJECT_UNAUTHORIZED=0 (dev only).
      cache: "no-store",
    };

    const res = await fetch(url, init);
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Virtualizor non-JSON response: ${text.slice(0, 300)}`);
    }

    if (!res.ok || data?.error) {
      const err = Array.isArray(data?.error)
        ? data.error.join("; ")
        : (data?.error || `HTTP ${res.status}`);
      throw new Error(err);
    }

    return data;
  }

  /** Search Virtualizor by IP / hostname / username, return FIRST matching vpsid (exact IP wins). */
  async findVpsId(by = {}) {
    const trySearch = async (q) => {
      const qs = Object.entries(q)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");

      const r = await this.call(`act=listvs&search=1&${qs}&page=1&reslen=100`);
      const vsMap = r?.vs || r?.vps || r;
      if (!vsMap || typeof vsMap !== "object") return null;

      const list = Object.values(vsMap);
      if (!list.length) return null;

      if (q.ip) {
        const exact = list.find(v => Array.isArray(v?.ips) && v.ips.includes(q.ip));
        if (exact?.vpsid || exact?.vid || exact?.subid) {
          return String(exact.vpsid ?? exact.vid ?? exact.subid);
        }
      }
      if (q.hostname) {
        const exact = list.find(v => (v?.hostname || "").toLowerCase() === q.hostname.toLowerCase());
        if (exact?.vpsid || exact?.vid || exact?.subid) {
          return String(exact.vpsid ?? exact.vid ?? exact.subid);
        }
      }

      const first = list[0];
      return first?.vpsid
        ? String(first.vpsid)
        : (first?.vid ? String(first.vid) : (first?.subid ? String(first.subid) : null));
    };

    return (
      (by.ip && await trySearch({ ip: by.ip })) ||
      (by.hostname && await trySearch({ hostname: by.hostname })) ||
      (by.username && await trySearch({ username: by.username })) ||
      null
    );
  }

  async getTemplates(vpsid) {
    return this.call(`svs=${vpsid}&act=ostemplate`);
  }

  async reinstall(vpsid, templateId, newPassword) {
    const post = {
      newos: String(templateId),
      newpass: newPassword,
      conf: newPassword,
      reinsos: "Reinstall",
    };
    return this.call(`svs=${vpsid}&act=ostemplate`, post);
  }
}

export default VirtualizorAPI;
