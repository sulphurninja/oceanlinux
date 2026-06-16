import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { ordersFilter: 'confirmed-only-v5', visibleStatuses: ['confirmed'] },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Company-Orders-Filter': 'confirmed-only-v5',
      },
    }
  );
}
