import { NextResponse } from 'next/server';
import { runAdvpsStockCheck } from '@/lib/advpsStockCheck';

/** Refresh ADVPS-backed IPStock rows from live api.advps.org stock. */
export async function GET() {
  try {
    const body = await runAdvpsStockCheck();
    return NextResponse.json(body);
  } catch (error) {
    console.error('[ADVPS-STOCK-CHECK] fatal:', error.message, error.stack);
    return NextResponse.json(
      { success: false, error: error.message, refreshed: 0, availabilityFlips: 0 },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
