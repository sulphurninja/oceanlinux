import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FILTER_VERSION = 'confirmed-active-only-v4';

export async function GET() {
  return NextResponse.json(
    {
      ordersFilter: FILTER_VERSION,
      visibleStatuses: ['confirmed', 'active'],
      deployCheck: 'If you see this JSON, the latest build is live.',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Company-Orders-Filter': FILTER_VERSION,
      },
    }
  );
}
