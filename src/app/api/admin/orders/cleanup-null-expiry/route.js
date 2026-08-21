import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';

const {
  DEFAULT_STALE_DAYS,
  deleteStaleNullExpiryOrders,
} = require('@/lib/cleanupNullExpiryOrders');

/**
 * GET  — preview orders that would be deleted (expiry null + bought 30+ days ago)
 * POST — delete them (optional body: { olderThanDays: 30, dryRun: false })
 */
export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const olderThanDays = Number(searchParams.get('days') || DEFAULT_STALE_DAYS);

    const result = await deleteStaleNullExpiryOrders({
      olderThanDays,
      dryRun: true,
    });

    return NextResponse.json({
      success: true,
      message: `${result.matchedCount} order(s) would be deleted (expiry null, older than ${olderThanDays} days)`,
      olderThanDays,
      ...result,
    });
  } catch (error) {
    console.error('[ADMIN-CLEANUP-NULL-EXPIRY] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const olderThanDays = Number(body?.olderThanDays || DEFAULT_STALE_DAYS);
    const dryRun = body?.dryRun === true;

    const result = await deleteStaleNullExpiryOrders({ olderThanDays, dryRun });

    return NextResponse.json({
      success: true,
      message: dryRun
        ? `${result.matchedCount} order(s) would be deleted`
        : `Deleted ${result.deletedCount} order(s) with null expiry (older than ${olderThanDays} days)`,
      olderThanDays,
      ...result,
    });
  } catch (error) {
    console.error('[ADMIN-CLEANUP-NULL-EXPIRY] POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
