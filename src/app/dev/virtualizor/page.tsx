// src/app/dev/virtualizor/page.tsx
"use client";
import { useState } from "react";

type TemplateEntry = { id: string; name: string; group?: string };

export default function VirtualizorDevPage() {
  const [token, setToken] = useState("");
  const [ip, setIp] = useState("");
  const [hostname, setHostname] = useState("");
  const [username, setUsername] = useState("");

  const [vpsid, setVpsid] = useState("");
  const [templatesRaw, setTemplatesRaw] = useState<any>(null);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [password, setPassword] = useState("");

  const [log, setLog] = useState<string>("");

  const call = async (payload: any) => {
    const r = await fetch("/api/dev/virtualizor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.message || j?.error || r.statusText);
    return j;
  };

  const appendLog = (o: any) => setLog(prev => `${prev}\n${JSON.stringify(o, null, 2)}\n`);

  const onFind = async () => {
    setLog("");
    try {
      const res = await call({ action: "find", ip: ip || undefined, hostname: hostname || undefined, username: username || undefined });
      appendLog(res);
      if (res?.vpsid) setVpsid(String(res.vpsid));
    } catch (e: any) {
      appendLog({ error: e.message });
    }
  };

  const flattenTemplates = (raw: any): TemplateEntry[] => {
    // Virtualizor ostemplate response typically has oslist keyed by virt (kvm/xen/openvz)
    const list = raw?.oslist || raw?.os || raw;
    const out: TemplateEntry[] = [];
    if (list && typeof list === "object") {
      for (const [group, items] of Object.entries(list)) {
        if (Array.isArray(items)) {
          for (const it of items as any[]) {
            const id = String(it?.osid ?? it?.id ?? it?.tid ?? "");
            const name = String(it?.name ?? it?.filename ?? it?.distro ?? it?.desc ?? id);
            if (id) out.push({ id, name, group });
          }
        } else if (items && typeof items === "object") {
          for (const it of Object.values(items as any)) {
            const id = String((it as any)?.osid ?? (it as any)?.id ?? (it as any)?.tid ?? "");
            const name = String((it as any)?.name ?? (it as any)?.filename ?? (it as any)?.distro ?? (it as any)?.desc ?? id);
            if (id) out.push({ id, name, group });
          }
        }
      }
    }
    return out;
  };

  const onTemplates = async () => {
    setLog("");
    try {
      if (!vpsid) throw new Error("Set vpsid first (or Find it)");
      const res = await call({ action: "templates", vpsid });
      appendLog(res);
      setTemplatesRaw(res?.templatesRaw || null);
      const flat = flattenTemplates(res?.templatesRaw);
      setTemplates(flat);
    } catch (e: any) {
      appendLog({ error: e.message });
    }
  };

  const onReinstall = async () => {
    setLog("");
    try {
      if (!vpsid) throw new Error("Set vpsid first (or Find it)");
      if (!templateId) throw new Error("Select a templateId");
      if (!password) throw new Error("Enter a new root password");
      const res = await call({ action: "reinstall", vpsid, templateId, password });
      appendLog(res);
    } catch (e: any) {
      appendLog({ error: e.message });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Virtualizor Dev Console</h1>

      <div className="grid gap-3">
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">1) Find VPS ID</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="border rounded px-3 py-2" placeholder="IP (e.g. 165.99.223.67)" value={ip} onChange={e => setIp(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Hostname (optional)" value={hostname} onChange={e => setHostname(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Username (optional)" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onFind} className="px-4 py-2 rounded bg-black text-white">Find</button>
          <input className="border rounded px-3 py-2 flex-1" placeholder="Resolved vpsid" value={vpsid} onChange={e => setVpsid(e.target.value)} />
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">2) List Templates</h2>
        <div className="flex items-center gap-3">
          <button onClick={onTemplates} className="px-4 py-2 rounded bg-black text-white">Fetch templates for vpsid</button>
          <span className="text-sm text-gray-600">vpsid: {vpsid || "—"}</span>
        </div>

        {templates.length > 0 && (
          <div className="grid gap-2">
            <label className="text-sm font-medium">Pick a template</label>
            <select className="border rounded px-3 py-2" value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">-- Select --</option>
              {templates.map(t => (
                <option key={`${t.group}-${t.id}`} value={t.id}>
                  {t.group ? `[${t.group}] ` : ""}{t.name} (id: {t.id})
                </option>
              ))}
            </select>
          </div>
        )}

        {templatesRaw && (
          <details className="mt-2">
            <summary className="cursor-pointer">Raw templates payload</summary>
            <pre className="text-xs overflow-x-auto mt-2">{JSON.stringify(templatesRaw, null, 2)}</pre>
          </details>
        )}
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">3) Reinstall</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Template ID" value={templateId} onChange={e => setTemplateId(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="New root password" type="text" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button onClick={onReinstall} className="px-4 py-2 rounded bg-black text-white">Reinstall now</button>
      </section>

      <section className="border rounded p-4">
        <h2 className="font-semibold mb-2">Console</h2>
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{log || "—"}</pre>
      </section>
    </div>
  );
}
