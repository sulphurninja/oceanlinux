// /api/dev/virtualizor/debug (temporary)
import { NextResponse } from "next/server";
import { VirtualizorAPI } from "@/services/virtualizorApi";
export const runtime = "nodejs";

export async function GET() {

  return NextResponse.json({ message:"Nothing here anymore!" });
}
