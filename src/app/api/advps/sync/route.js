import { NextResponse } from 'next/server';
import { runAdvpsCatalogSync } from '@/lib/advpsCatalogSync';
import { enforceCronSecret } from '@/lib/apiSecurity';

export async function GET(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  try {
    const result = await runAdvpsCatalogSync();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[ADVPS-SYNC GET] error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
