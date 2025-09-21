"use client";
import { useState } from "react";

export default function HostycareInspectPage() {
  const [serviceId, setServiceId] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<any>(null);
  const [error, setError] = useState<string>("");

  const onFetch = async () => {
    setLoading(true);
    setError("");
    setResp(null);
    try {
      const r = await fetch(`/api/hostycare/inspect?serviceId=${encodeURIComponent(serviceId)}`, {
        headers: { "x-admin-token": token },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || j?.error || r.statusText);
      setResp(j);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Hostycare Service Inspector</h1>
      <div className="grid gap-3">
        <input
          className="border rounded px-3 py-2"
          placeholder="Service ID (e.g. 38713)"
          value={serviceId}
          onChange={e => setServiceId(e.target.value)}
        />
        {/* <input
          className="border rounded px-3 py-2"
          placeholder="Admin Token (HOSTYCARE_INSPECT_TOKEN)"
          value={token}
          onChange={e => setToken(e.target.value)}
          type="password"
        /> */}
        <button
          onClick={onFetch}
          disabled={loading || !serviceId }
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      {resp && (
        <div className="space-y-4">
          <section className="border rounded p-4">
            <h2 className="font-semibold mb-2">Summary</h2>
            <pre className="text-sm overflow-x-auto">
{JSON.stringify(resp.summary, null, 2)}
            </pre>
          </section>
          <section className="border rounded p-4">
            <h2 className="font-semibold mb-2">Details (raw)</h2>
            <pre className="text-sm overflow-x-auto">
{JSON.stringify(resp.detailsRaw, null, 2)}
            </pre>
          </section>
          <section className="border rounded p-4">
            <h2 className="font-semibold mb-2">Info (raw)</h2>
            <pre className="text-sm overflow-x-auto">
{JSON.stringify(resp.infoRaw, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
}
