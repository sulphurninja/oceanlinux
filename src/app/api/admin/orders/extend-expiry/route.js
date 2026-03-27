import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import fs from 'fs';
import path from 'path';

// Default IP list path (optional; can override via POST body.ips)
const DEFAULT_IPS_PATH = path.join(process.cwd(), 'scripts', 'extend-orders-expiry-ips.txt');

function getIpList(bodyIps) {
  if (bodyIps && Array.isArray(bodyIps) && bodyIps.length > 0) {
    return bodyIps.map((ip) => String(ip).trim()).filter(Boolean);
  }
  try {
    const raw = fs.readFileSync(DEFAULT_IPS_PATH, 'utf8');
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** Build list that matches both "1.2.3.4" and "1.2.3.4:49965" in DB */
function expandIpListForMatch(ips) {
  const set = new Set();
  for (const ip of ips) {
    set.add(ip);
    if (!ip.includes(':')) {
      set.add(`${ip}:49965`);
    }
  }
  return [...set];
}

// Only extend orders that are expired or expiring within this many days.
// Prevents re-running the job from stacking +10 days repeatedly (e.g. +30 from 3 runs).
const EXPIRE_SOON_DAYS = 7;

/**
 * POST /api/admin/orders/extend-expiry
 * Body (optional):
 *   - { productNameContains: "Noida" } — extend all orders whose productName contains this (case-insensitive) by 10 days
 *   - { ips: string[] } — else use IP list (file or body)
 *   - { cleanupOnly: true } — only cap over-extended orders, don't extend
 */
export async function POST(request) {
  try {
    await connectDB();

    const userId = await getDataFromToken(request);
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(userId);
    const isAdmin = user?.isAdmin === true || user?.userType === 'admin';

    let body = {};
    try {
      body = await request.json();
    } catch {
      // no body is ok — use file
    }

    const productNameContains = typeof body?.productNameContains === 'string' ? body.productNameContains.trim() : null;

    // --- Extend by product name (e.g. "Noida") — no IP list, no cap, just +10 days for all matching orders
    if (productNameContains) {
      const now = new Date();
      const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      const productFilter = { productName: new RegExp(productNameContains, 'i') };

      const r1 = await Order.updateMany(
        { ...productFilter, expiryDate: { $ne: null, $gte: now } },
        [{ $set: { expiryDate: { $dateAdd: { startDate: '$expiryDate', unit: 'day', amount: 10 } } } }]
      );
      const r2 = await Order.updateMany(
        { ...productFilter, $or: [{ expiryDate: null }, { expiryDate: { $lt: now } }] },
        { $set: { expiryDate: tenDaysFromNow, status: 'active' } }
      );

      const modifiedCount = r1.modifiedCount + r2.modifiedCount;
      return NextResponse.json({
        success: true,
        message: `Extended expiry by 10 days for ${modifiedCount} order(s) with productName containing "${productNameContains}".`,
        modifiedCount,
        productNameContains,
      });
    }

    // --- IP-list mode (existing logic)
    const cleanupOnly = body?.cleanupOnly === true;

    const ips = getIpList(body?.ips);
    if (!ips || ips.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            'No IPs provided. Add { "ips": ["1.2.3.4", ...] } in body or create scripts/extend-orders-expiry-ips.txt. Or use { "productNameContains": "Noida" } to extend by product name.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const expireSoonCutoff = new Date(now.getTime() + EXPIRE_SOON_DAYS * 24 * 60 * 60 * 1000);
    const ipMatchList = expandIpListForMatch(ips);
    const MAX_SUBSCRIPTION_DAYS = 30;

    // STEP 0: Cap over-extended orders (expiry > createdAt + 30 days) back to createdAt + 30 days
    // Use aggregation pipeline to compute maxExpiry and cap if needed
    const r0 = await Order.updateMany(
      {
        ipAddress: { $in: ipMatchList },
        expiryDate: { $ne: null },
      },
      [
        {
          $set: {
            expiryDate: {
              $cond: {
                if: {
                  $gt: [
                    '$expiryDate',
                    {
                      $dateAdd: {
                        startDate: '$createdAt',
                        unit: 'day',
                        amount: MAX_SUBSCRIPTION_DAYS,
                      },
                    },
                  ],
                },
                then: {
                  $dateAdd: {
                    startDate: '$createdAt',
                    unit: 'day',
                    amount: MAX_SUBSCRIPTION_DAYS,
                  },
                },
                else: '$expiryDate',
              },
            },
          },
        },
      ]
    );

    let r1 = { matchedCount: 0, modifiedCount: 0 };
    let r2 = { matchedCount: 0, modifiedCount: 0 };

    if (!cleanupOnly) {
      // STEP 1: Not expired but expiring soon (within 7 days): add 10 days. Skips orders already extended (expiry > now+7).
      r1 = await Order.updateMany(
        {
          ipAddress: { $in: ipMatchList },
          expiryDate: { $ne: null, $gte: now, $lte: expireSoonCutoff },
        },
        [{ $set: { expiryDate: { $dateAdd: { startDate: '$expiryDate', unit: 'day', amount: 10 } } } }]
      );

      // STEP 2: Expired or null expiry: set expiry to now+10 days and activate
      r2 = await Order.updateMany(
        {
          ipAddress: { $in: ipMatchList },
          $or: [{ expiryDate: null }, { expiryDate: { $lt: now } }],
        },
        { $set: { expiryDate: tenDaysFromNow, status: 'active' } }
      );
    }

    const matchedCount = r1.matchedCount + r2.matchedCount;
    const modifiedCount = r0.modifiedCount + r1.modifiedCount + r2.modifiedCount;

    return NextResponse.json({
      success: true,
      message: cleanupOnly
        ? `Capped ${r0.modifiedCount} over-extended order(s) (expiry > createdAt + ${MAX_SUBSCRIPTION_DAYS} days).`
        : `Capped ${r0.modifiedCount} over-extended order(s), then extended expiry by 10 days (only expired or expiring within ${EXPIRE_SOON_DAYS} days) for ${r1.modifiedCount + r2.modifiedCount} order(s).`,
      cappedCount: r0.modifiedCount,
      extendedCount: cleanupOnly ? 0 : r1.modifiedCount + r2.modifiedCount,
      matchedCount: cleanupOnly ? r0.matchedCount : matchedCount,
      modifiedCount,
      ipCount: ips.length,
      cleanupOnly,
    });
  } catch (error) {
    console.error('[extend-expiry]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to extend expiry' },
      { status: 500 }
    );
  }
}
