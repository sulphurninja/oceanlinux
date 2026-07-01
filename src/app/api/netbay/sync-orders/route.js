import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret } from '@/lib/apiSecurity';
const { syncAllNetbayOrdersFromApi } = require('@/lib/netbayOrderSync');

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Sync Netbay VM expiry (and credentials) for all active orders.
 * Uses GET /api/v1/services/:id — Netbay expiryDate is source of truth.
 *
 * Cron: schedule in vercel.json. Optional ?force=1 for manual runs with CRON_SECRET.
 */
export async function GET(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  try {
    await connectDB();
    const result = await syncAllNetbayOrdersFromApi();
    console.log('[NETBAY-SYNC-ORDERS]', result);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[NETBAY-SYNC-ORDERS] failed:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
