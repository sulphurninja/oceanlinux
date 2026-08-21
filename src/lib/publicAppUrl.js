/**
 * Public site origin for links resellers copy (API base URL, cURL examples).
 * Prefer NEXT_PUBLIC_BASE_URL so localhost dev still shows the live endpoint.
 */
export function getPublicAppOrigin() {
  const fromEnv = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
  return 'https://oceanlinux.com';
}

export function getResellerApiBaseUrl() {
  return `${getPublicAppOrigin()}/api/v1/reseller`;
}
