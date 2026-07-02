import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COMPANY_FILTER_VERSION } from '@/lib/companyOrders';
import {
  getAdminPanelPassword,
  isAdminGateSessionValidForMiddleware,
} from '@/lib/adminGate';
import {
  isAdminGateProtectedPath,
  isCronAuthorizedRequest,
} from '@/lib/adminGatePaths';

async function enforceAdminGateMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isAdminGateProtectedPath(pathname)) {
    return null;
  }

  if (isCronAuthorizedRequest(request)) {
    return null;
  }

  const ok = await isAdminGateSessionValidForMiddleware(request);
  if (ok) {
    return null;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        success: false,
        message: 'Admin panel password required',
        code: 'ADMIN_GATE_REQUIRED',
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('returnUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const gateResponse = await enforceAdminGateMiddleware(request);
  if (gateResponse) {
    return gateResponse;
  }

  // Already unlocked — skip login page
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login') {
    const ok = await isAdminGateSessionValidForMiddleware(request);
    if (ok) {
      const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/admin/dashboard';
      const dest = returnUrl.startsWith('/admin') ? returnUrl : '/admin/dashboard';
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

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
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/orders/provision',
    '/api/orders/update',
    '/api/orders/all',
    '/api/orders/auto-provision-batch',
    '/api/hostycare/inspect',
    '/api/hostycare/inspect/:path*',
  ],
};
