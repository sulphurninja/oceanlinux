// /api/dev/virtualizor/debug (temporary)
import { NextResponse } from "next/server";
import { VirtualizorAPI } from "@/services/virtualizorApi";
export const runtime = "nodejs";

export async function GET() {
  const vz = new VirtualizorAPI();
  const vms = await vz._listMyVms();
  return NextResponse.json({ vms });
}
