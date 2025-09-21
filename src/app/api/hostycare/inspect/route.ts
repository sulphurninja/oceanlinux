import { NextRequest, NextResponse } from "next/server";
const HostycareAPI = require("@/services/hostycareApi");

function inferVpsId(details: any, info: any): string | null {
  const candidates = [
    details?.vpsid,
    details?.vid,
    details?.subid,
    details?.server_id,
    details?.service?.vpsid,
    info?.vpsid,
    info?.server_id,
    info?.subid,
  ].filter(Boolean);
  return candidates.length ? String(candidates[0]) : null;
}

function requireAdmin(req: NextRequest) {
  const sent = req.headers.get("x-admin-token") || "";
  const need = process.env.HOSTYCARE_INSPECT_TOKEN || "";
  return !!need && sent === need;
}

export async function GET(req: NextRequest) {
  try {
    // if (!requireAdmin(req))
    //   return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId");
    if (!serviceId) {
      return NextResponse.json({ message: "serviceId is required" }, { status: 400 });
    }

    const api = new HostycareAPI();

    // Call both endpoints. If one is blocked, we still return the other.
    const [detailsRes, infoRes] = await Promise.allSettled([
      api.getServiceDetails(serviceId),
      api.getServiceInfo(serviceId),
    ]);

    const details = detailsRes.status === "fulfilled" ? detailsRes.value : { __error: detailsRes.reason?.message || String(detailsRes.reason) };
    const info    = infoRes.status    === "fulfilled" ? infoRes.value    : { __error: infoRes.reason?.message || String(infoRes.reason) };

    const vpsid = inferVpsId(details, info);

    // Echo key helper fields we might care about later (optional)
    const summary = {
      serviceId,
      vpsid,
      ip: details?.ip ?? info?.ip,
      hostname: details?.hostname ?? info?.hostname,
      username: details?.username ?? info?.username,
      status: details?.status ?? info?.status,
    };

    return NextResponse.json({
      ok: true,
      summary,
      detailsRaw: details,
      infoRaw: info,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!requireAdmin(req))
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const serviceId = body?.serviceId;
    if (!serviceId) {
      return NextResponse.json({ message: "serviceId is required" }, { status: 400 });
    }

    const api = new HostycareAPI();
    const [detailsRes, infoRes] = await Promise.allSettled([
      api.getServiceDetails(serviceId),
      api.getServiceInfo(serviceId),
    ]);

    const details = detailsRes.status === "fulfilled" ? detailsRes.value : { __error: detailsRes.reason?.message || String(detailsRes.reason) };
    const info    = infoRes.status    === "fulfilled" ? infoRes.value    : { __error: infoRes.reason?.message || String(infoRes.reason) };

    const vpsid = inferVpsId(details, info);
    const summary = {
      serviceId,
      vpsid,
      ip: details?.ip ?? info?.ip,
      hostname: details?.hostname ?? info?.hostname,
      username: details?.username ?? info?.username,
      status: details?.status ?? info?.status,
    };

    return NextResponse.json({
      ok: true,
      summary,
      detailsRaw: details,
      infoRaw: info,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
