import { NextResponse } from 'next/server';
import { COMPANY_FILTER_VERSION, COMPANY_VISIBLE_ORDER_STATUSES } from '@/lib/companyOrders';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      ordersFilter: COMPANY_FILTER_VERSION,
      visibleStatuses: COMPANY_VISIBLE_ORDER_STATUSES,
      managePanelRouting: 2,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Company-Orders-Filter': COMPANY_FILTER_VERSION,
      },
    }
  );
}
