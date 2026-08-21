/**
 * Email helpers — case-insensitive lookup for auth/signup.
 * New registrations store email lowercase; legacy mixed-case rows still match.
 */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function buildCaseInsensitiveEmailFilter(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { email: { $regex: new RegExp(`^${escaped}$`, 'i') } };
}

export async function findUserByEmail(User, email) {
  const filter = buildCaseInsensitiveEmailFilter(email);
  if (!filter) return null;
  return User.findOne(filter);
}

export async function findOtherUserByEmail(User, email, excludeUserId) {
  const filter = buildCaseInsensitiveEmailFilter(email);
  if (!filter || !excludeUserId) return null;
  return User.findOne({ ...filter, _id: { $ne: excludeUserId } });
}
