// src/app/api/dev/virtualizor/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { VirtualizorAPI } from "@/services/virtualizorApi";

function requireAdmin(req) {
  const sent = req.headers.get("x-admin-token") || "";
  const need = process.env.HOSTYCARE_INSPECT_TOKEN || "";
  return !!need && sent === need;
}

export async function POST(req) {
  try {
    // if (!requireAdmin(req)) {
    //   return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    // }

    const body = await req.json();
    const { action } = body || {};
    if (!action) {
      return NextResponse.json({ message: "action is required" }, { status: 400 });
    }

    const vz = new VirtualizorAPI();

    if (action === "find") {
      const { ip, hostname, username } = body || {};
      if (!ip && !hostname && !username) {
        return NextResponse.json({ message: "Provide ip or hostname or username" }, { status: 400 });
      }
      const vpsid = await vz.findVpsId({ ip, hostname, username });
      return NextResponse.json({ ok: true, vpsid });
    }

    if (action === "templates") {
      const { vpsid } = body || {};
      if (!vpsid) return NextResponse.json({ message: "vpsid is required" }, { status: 400 });
      const tpl = await vz.getTemplates(vpsid);
      return NextResponse.json({ ok: true, templatesRaw: tpl });
    }

    if (action === "reinstall") {
      const { vpsid, templateId, password } = body || {};
      if (!vpsid || !templateId || !password) {
        return NextResponse.json({ message: "vpsid, templateId and password are required" }, { status: 400 });
      }
      const r = await vz.reinstall(vpsid, templateId, password);
      return NextResponse.json({ ok: true, result: r });
    }

    return NextResponse.json({ message: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
