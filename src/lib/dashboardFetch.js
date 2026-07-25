/**
 * Standard authenticated fetch for customer dashboard pages.
 * Always sends session cookies and avoids stale cached API responses.
 */
export function dashboardFetch(input, options = {}) {
  return fetch(input, {
    cache: 'no-store',
    credentials: 'include',
    ...options,
  });
}
