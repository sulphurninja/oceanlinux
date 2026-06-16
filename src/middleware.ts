import { NextResponse } from 'next/server';
import { COMPANY_FILTER_VERSION } from '@/lib/companyOrders';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/company') && !pathname.startsWith('/api/company')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('X-Company-Orders-Filter', COMPANY_FILTER_VERSION);
  return response;
}

export const config = {
  matcher: ['/company/:path*', '/api/company/:path*'],
};
