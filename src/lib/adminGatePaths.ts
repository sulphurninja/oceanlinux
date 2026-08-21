/** Routes that require ADMIN_PANEL_PASSWORD session (pages + APIs). */
export const ADMIN_GATE_PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/gate']);

// NOTE: user-facing endpoints (e.g. /api/ipstock, /api/slot-ips) are NOT gated
// here — their GET is used by the public store. Their write operations are
// protected individually at the route level via enforceAdmin/requireAdmin.
const ADMIN_API_PREFIXES = [
  '/api/admin/',
  '/api/hostycare/inspect',
];

const ADMIN_API_EXACT = new Set([
  '/api/orders/provision',
  '/api/orders/update',
  '/api/orders/all',
  '/api/orders/auto-provision-batch',
]);

export function isAdminGatePublicPath(pathname: string): boolean {
  return ADMIN_GATE_PUBLIC_PATHS.has(pathname);
}

export function isAdminGateProtectedPath(pathname: string): boolean {
  if (isAdminGatePublicPath(pathname)) return false;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return true;
  }

  if (ADMIN_API_EXACT.has(pathname)) return true;

  return ADMIN_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Cron jobs (Vercel) must bypass the human admin gate. */
export function isCronAuthorizedRequest(request: {
  headers: Headers;
  nextUrl?: { searchParams: URLSearchParams };
  url?: string;
}): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const url = request.nextUrl ?? new URL(request.url || 'http://localhost');
  const provided =
    request.headers.get('x-cron-secret') ||
    url.searchParams.get('secret') ||
    bearer;

  return provided === secret;
}
