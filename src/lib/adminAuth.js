import connectDB from '@/lib/db';
import User from '@/models/userModel';
import { getDataFromTokenSafe } from '@/helper/getDataFromToken';

export function isAdminUser(user) {
  if (!user) return false;
  return (
    user.userType === 'admin' ||
    user.isAdmin === true ||
    user.role === 'Admin' ||
    user.role === 'admin'
  );
}

/**
 * Resolves the logged-in admin from the session cookie.
 * Uses `.lean()` so fields like `role` that exist in MongoDB but
 * are not declared on the User schema are still readable.
 */
export async function requireAdmin(request) {
  const adminId = getDataFromTokenSafe(request);
  if (!adminId) return null;

  await connectDB();
  const admin = await User.findById(adminId).lean();
  if (!isAdminUser(admin)) return null;
  return admin;
}
