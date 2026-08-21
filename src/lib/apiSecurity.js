import { NextResponse } from 'next/server';
import { getDataFromTokenSafe } from '@/helper/getDataFromToken';
import { requireAdmin, isAdminUser, requireAdminGate, requireAdminUser } from '@/lib/adminAuth';
import { getAdminPanelPassword } from '@/lib/adminGate';
import User from '@/models/userModel';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

/** Returns true when request carries a valid CRON_SECRET. */
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided =
    request.headers.get('x-cron-secret') ||
    url.searchParams.get('secret') ||
    bearer;
  return provided === secret;
}

/** Cron / internal jobs — fails closed if CRON_SECRET is unset. */
export function enforceCronSecret(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, message: 'CRON_SECRET not configured' },
      { status: 503 }
    );
  }
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided =
    request.headers.get('x-cron-secret') ||
    url.searchParams.get('secret') ||
    bearer;
  if (provided !== secret) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Cron secret OR logged-in customer (production). Dev allows anonymous refresh. */
export function enforceCronOrLoggedInUser(request) {
  if (isCronAuthorized(request)) return null;
  const userId = getDataFromTokenSafe(request);
  if (userId) return null;
  if (process.env.NODE_ENV !== 'production') return null;
  return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
}

/** Block dangerous test/dev routes in production unless CRON_SECRET provided. */
export function blockUnlessDevOrCron(request) {
  if (process.env.NODE_ENV !== 'production') return null;
  return enforceCronSecret(request);
}

/** Logged-in user must own the order (or be admin). */
export async function enforceOrderAccess(request, order) {
  if (!order) {
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  const userId = getDataFromTokenSafe(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
  }

  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user) {
    return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
  }

  if (isAdminUser(user)) return null;
  if (String(order.user) !== String(userId)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/** Admin panel password gate — returns NextResponse on failure, null on success. */
export async function enforceAdminGate(request) {
  if (await requireAdminGate(request)) return null;

  if (!getAdminPanelPassword()) {
    return NextResponse.json(
      { success: false, message: 'Admin panel password is not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { success: false, message: 'Admin panel password required', code: 'ADMIN_GATE_REQUIRED' },
    { status: 401 }
  );
}

/** Admin-only routes — returns NextResponse on failure, null on success. */
export async function enforceAdmin(request) {
  const gateDenied = await enforceAdminGate(request);
  if (gateDenied) return gateDenied;

  const admin = await requireAdminUser(request);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
  }
  return null;
}

/** SSH/proxy tools — user must own a paid order on this IP (or be admin). */
export async function enforceProxyServerAccess(request, ip) {
  const userId = getDataFromTokenSafe(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Login required' }, { status: 401 });
  }

  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user) {
    return NextResponse.json({ success: false, message: 'Login required' }, { status: 401 });
  }
  if (isAdminUser(user)) return null;

  const cleanIp = String(ip || '').trim().split(':')[0];
  if (!cleanIp) {
    return NextResponse.json({ success: false, message: 'Invalid IP' }, { status: 400 });
  }

  const owned = await Order.findOne({
    user: userId,
    status: { $in: ['confirmed', 'active'] },
    $or: [
      { ipAddress: { $regex: cleanIp.replace(/\./g, '\\.') } },
      { ipAddress: cleanIp },
    ],
  }).lean();

  if (!owned) {
    return NextResponse.json(
      { success: false, message: 'You can only run this on servers in your account' },
      { status: 403 }
    );
  }
  return null;
}

export function sanitizeSlotPackage(pkg, { includeIps = false } = {}) {
  const ips = pkg.ips || [];
  const totalCount = ips.length;
  const allocatedCount = ips.filter((ip) => ip.allocated).length;
  const availableCount = totalCount - allocatedCount;

  const base = {
    _id: pkg._id,
    name: pkg.name,
    description: pkg.description,
    price: pkg.price,
    available: pkg.available,
    promoCodes: pkg.promoCodes,
    totalCount,
    availableCount,
    allocatedCount,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };

  if (includeIps) {
    return { ...pkg, totalCount, availableCount, allocatedCount };
  }
  return base;
}
