// /api/dev/virtualizor/debug (temporary)
import { NextResponse } from "next/server";
import { blockUnlessDevOrCron } from "@/lib/apiSecurity";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = blockUnlessDevOrCron(request);
  if (blocked) return blocked;

  return NextResponse.json({ message: "Nothing here anymore!" });
}
