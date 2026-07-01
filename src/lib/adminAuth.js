import connectDB from '@/lib/db';
import User from '@/models/userModel';
import { getDataFromTokenSafe } from '@/helper/getDataFromToken';
import {
  getAdminPanelPassword,
  isAdminGateSessionValid,
} from '@/lib/adminGate';
import { isCronAuthorizedRequest } from '@/lib/adminGatePaths';

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
 * Admin panel password gate — required for all admin API access unless cron.
 * Returns false when gate password missing/invalid (fail closed).
 */
export async function requireAdminGate(request) {
  if (isCronAuthorizedRequest(request)) return true;

  if (!getAdminPanelPassword()) return false;
  return isAdminGateSessionValid(request);
}

/**
 * Logged-in user with Admin role only (no panel password gate).
 */
export async function requireAdminUser(request) {
  const adminId = getDataFromTokenSafe(request);
  if (!adminId) return null;

  await connectDB();
  const admin = await User.findById(adminId).lean();
  if (!isAdminUser(admin)) return null;
  return admin;
}

/**
 * Admin role + valid admin panel password session (or cron bypass).
 */
export async function requireAdmin(request) {
  const gateOk = await requireAdminGate(request);
  if (!gateOk) return null;
  return requireAdminUser(request);
}
