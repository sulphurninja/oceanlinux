import crypto from 'crypto';

/**
 * Constant-time check of the `x-internal-key` header against INTERNAL_API_KEY.
 * Fails closed when the env var is unset so a missing config can never open the
 * internal service-action endpoints to the public.
 */
export function internalKeyMatches(provided) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || !provided) return false;

  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(provided));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
