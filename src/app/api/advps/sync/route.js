import { NextResponse } from 'next/server';
import { runAdvpsCatalogSync } from '@/lib/advpsCatalogSync';

export async function GET() {
  try {
    const result = await runAdvpsCatalogSync();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[ADVPS-SYNC GET] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
