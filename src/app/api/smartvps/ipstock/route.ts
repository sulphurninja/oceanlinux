// /src/app/api/smartvps/ipstock/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server'
const SmartVpsAPI = require('@/services/smartvpsApi')

export async function GET() {
  try {
    const api = new SmartVpsAPI();
    const r = await api.ipstock();

    // SmartVPS often returns a JSON STRING; normalize
    const body = typeof r === 'string' ? JSON.parse(r) : r;

    // Packages is an array: [{ id, name, ipv4, status }, ...]
    const pkgs = Array.isArray(body?.packages) ? body.packages : [];

    const rows = pkgs.map((p: any) => ({
      ip: String(p?.name ?? ''),      // what your <Select> will display & save
      vps: '',                        // unknown in this payload
      qty: Number(p?.ipv4 ?? 0),      // available IPv4 count
      pid: String(p?.id ?? ''),       // package id
    }));

    return NextResponse.json({ success: true, rows });
  } catch (e: any) {
    console.error('[SmartVPS ipstock] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
