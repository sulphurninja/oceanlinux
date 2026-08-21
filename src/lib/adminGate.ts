const GATE_SALT = 'oceanlinux-admin-gate-v1';
export const ADMIN_GATE_COOKIE = 'admin_gate';
/** 12 hours */
export const ADMIN_GATE_MAX_AGE = 60 * 60 * 12;

async function signGateToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(GATE_SALT));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getAdminPanelPassword(): string | undefined {
  const value = process.env.ADMIN_PANEL_PASSWORD?.trim();
  return value || undefined;
}

/**
 * Middleware (Edge) gate check.
 *
 * Production fails closed: without ADMIN_PANEL_PASSWORD no cookie is accepted,
 * otherwise any 64-hex value would unlock the admin pages. Local dev keeps a
 * format-only fallback because .env is not always loaded in the Edge runtime.
 */
export async function isAdminGateSessionValidForMiddleware(
  request: CookieRequest
): Promise<boolean> {
  const token = readAdminGateCookie(request);
  if (!token) return false;

  const secret = getAdminPanelPassword();
  if (secret) {
    return verifyAdminGateCookie(token);
  }

  if (process.env.NODE_ENV === 'production') return false;
  return /^[a-f0-9]{64}$/i.test(token);
}

export async function createAdminGateCookieValue(): Promise<string | null> {
  const secret = getAdminPanelPassword();
  if (!secret) return null;
  return signGateToken(secret);
}

export async function verifyAdminGateCookie(
  cookieValue: string | undefined | null
): Promise<boolean> {
  const secret = getAdminPanelPassword();
  if (!secret || !cookieValue) return false;
  const expected = await signGateToken(secret);
  if (cookieValue.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < cookieValue.length; i++) {
    diff |= cookieValue.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyAdminGatePassword(password: string): Promise<boolean> {
  const secret = getAdminPanelPassword();
  if (!secret || !password) return false;

  const maxLen = Math.max(password.length, secret.length);
  let diff = password.length ^ secret.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (password.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  }
  return diff === 0;
}

type CookieRequest = {
  cookies?: { get: (name: string) => { value?: string } | undefined };
  headers?: Headers;
};

/** Read admin_gate from NextRequest cookies or Cookie header. */
export function readAdminGateCookie(request: CookieRequest): string | undefined {
  const fromCookies = request.cookies?.get?.(ADMIN_GATE_COOKIE)?.value;
  if (fromCookies) return fromCookies;

  const header = request.headers?.get?.('cookie') || '';
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key !== ADMIN_GATE_COOKIE) continue;
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return undefined;
}

export async function isAdminGateSessionValid(request: CookieRequest): Promise<boolean> {
  return verifyAdminGateCookie(readAdminGateCookie(request));
}
