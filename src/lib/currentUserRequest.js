let inflight = null;

/** One in-flight /api/users/me shared by the layout, auth, and pages. */
export function fetchCurrentUser() {
  if (!inflight) {
    inflight = fetch('/api/users/me', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
