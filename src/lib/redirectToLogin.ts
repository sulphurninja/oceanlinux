'use client';

const AUTH_STORAGE_KEYS = [
  'lastClientTxnId',
  'user',
  'preferences',
  'lastRenewalTxnId',
  'renewalOrderId',
];

function resolveReturnPath(explicit?: string): string | null {
  if (explicit && explicit.startsWith('/') && !explicit.startsWith('//')) {
    return explicit;
  }

  if (typeof window === 'undefined') return null;

  const { pathname, search } = window.location;
  if (!pathname || pathname === '/login' || pathname === '/signup') {
    return null;
  }

  return `${pathname}${search || ''}`;
}

/** Clear stale client auth state, drop session cookie, then open login (full page load). */
export function redirectToLogin(returnPath?: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  const targetReturn = resolveReturnPath(returnPath);
  if (targetReturn) {
    try {
      localStorage.setItem('redirectAfterLogin', targetReturn);
    } catch {
      /* ignore */
    }
  }

  for (const key of AUTH_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  return fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    .then(() => {})
    .catch(() => {})
    .finally(() => {
      window.location.href = '/login';
    });
}
