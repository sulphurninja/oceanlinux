import { NextResponse } from 'next/server';
import {
  COMPANY_VISIBLE_ORDER_STATUSES,
} from '@/lib/companyOrders';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Public endpoint to verify production is running the latest company orders filter. */
export async function GET() {
  return NextResponse.json(
    {
      ordersFilter: 'confirmed-active-only-v3',
      visibleStatuses: COMPANY_VISIBLE_ORDER_STATUSES,
      message: 'If /company still shows cancelled orders, rebuild with: rm -rf .next && bun run build && pm2 restart oceanlinux',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Company-Orders-Filter': 'confirmed-active-only-v3',
      },
    }
  );
}
