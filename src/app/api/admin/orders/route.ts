// app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

/** Fields needed for manageOrders list + edit dialog — excludes heavy blobs. */
const LIST_SELECT = [
  'user',
  'productName',
  'memory',
  'price',
  'originalPrice',
  'promoDiscount',
  'status',
  'provisioningStatus',
  'provisioningError',
  'hostycareServiceId',
  'smartvpsServiceId',
  'advpsServiceId',
  'advpsOrderId',
  'netbayServiceId',
  'provider',
  'autoProvisioned',
  'ipAddress',
  'username',
  'password',
  'os',
  'transactionId',
  'clientTxnId',
  'gatewayOrderId',
  'paymentMethod',
  'paymentDetails',
  'walletDeduction',
  'createdAt',
  'expiryDate',
  'lastAction',
  'lastActionTime',
  'invoiceNumber',
  'customerName',
  'customerEmail',
].join(' ');

const EXPORT_SELECT = [
  ...LIST_SELECT.split(' '),
].join(' ');

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function statusFilterClause(status: string | null) {
  if (!status) return null;
  if (status === 'pending') {
    return { status: { $nin: ['confirmed', 'active', 'paid', 'completed'] } };
  }
  if (status === 'confirmed') {
    return { status: { $in: ['confirmed', 'paid', 'completed'] } };
  }
  if (status === 'active') {
    return { status: 'active' };
  }
  return null;
}

function provisioningFilterClause(value: string | null) {
  if (!value) return null;
  if (value === 'not_provisioned') {
    return {
      autoProvisioned: { $ne: true },
      $or: [{ ipAddress: { $in: [null, ''] } }, { username: { $in: [null, ''] } }],
    };
  }
  if (value === 'manual_setup') {
    return {
      autoProvisioned: { $ne: true },
      ipAddress: { $nin: [null, ''] },
      username: { $nin: [null, ''] },
    };
  }
  return { provisioningStatus: value };
}

async function buildSearchClause(search: string) {
  const term = search.trim();
  if (!term) return null;

  const regex = new RegExp(escapeRegex(term), 'i');
  const or: Record<string, unknown>[] = [
    { productName: regex },
    { transactionId: regex },
    { clientTxnId: regex },
    { ipAddress: regex },
    { invoiceNumber: regex },
    { customerName: regex },
    { customerEmail: regex },
  ];

  if (/^[a-f\d]{24}$/i.test(term)) {
    or.push({ _id: term });
  }

  const matchingUsers = await User.find({
    $or: [{ name: regex }, { email: regex }, { phone: regex }],
  })
    .select('_id')
    .limit(50)
    .lean();

  if (matchingUsers.length) {
    or.push({ user: { $in: matchingUsers.map((u) => u._id) } });
  }

  return { $or: or };
}

async function buildFilter(searchParams: URLSearchParams) {
  const and: Record<string, unknown>[] = [];

  const statusClause = statusFilterClause(searchParams.get('status'));
  if (statusClause) and.push(statusClause);

  const provider = searchParams.get('provider');
  if (provider) {
    if (provider === 'hostycare') {
      and.push({
        $or: [
          { provider: { $in: [null, '', 'hostycare'] } },
          { provider: { $exists: false } },
        ],
      });
    } else {
      and.push({ provider });
    }
  }

  const os = searchParams.get('os');
  if (os) {
    and.push({ os: new RegExp(escapeRegex(os), 'i') });
  }

  const provClause = provisioningFilterClause(searchParams.get('provisioningStatus'));
  if (provClause) and.push(provClause);

  const autoProvisioned = searchParams.get('autoProvisioned');
  if (autoProvisioned === 'auto') and.push({ autoProvisioned: true });
  if (autoProvisioned === 'manual') and.push({ autoProvisioned: { $ne: true } });

  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00.000Z`);
      if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(to.getTime())) createdAt.$lte = to;
    }
    if (Object.keys(createdAt).length) and.push({ createdAt });
  }

  const search = searchParams.get('search')?.trim();
  if (search) {
    const searchClause = await buildSearchClause(search);
    if (searchClause) and.push(searchClause);
  }

  if (!and.length) return {};
  if (and.length === 1) return and[0];
  return { $and: and };
}

async function fetchGlobalStats() {
  const [rows] = await Order.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [
              { $not: { $in: ['$status', ['confirmed', 'active', 'paid', 'completed']] } },
              1,
              0,
            ],
          },
        },
        confirmed: {
          $sum: {
            $cond: [{ $in: ['$status', ['confirmed', 'paid', 'completed']] }, 1, 0],
          },
        },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$provisioningStatus', 'failed'] }, 1, 0] },
        },
        totalRevenue: {
          $sum: {
            $cond: [
              { $in: ['$status', ['confirmed', 'active', 'paid', 'completed']] },
              { $ifNull: ['$price', 0] },
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    total: rows?.total || 0,
    pending: rows?.pending || 0,
    confirmed: rows?.confirmed || 0,
    active: rows?.active || 0,
    failed: rows?.failed || 0,
    totalRevenue: rows?.totalRevenue || 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const exportMode = searchParams.get('export');

    if (exportMode === 'gst') {
      const from = searchParams.get('from');
      const to = searchParams.get('to');
      if (!from || !to) {
        return NextResponse.json({ message: 'from and to dates are required' }, { status: 400, headers: NO_CACHE });
      }
      const fromDate = new Date(`${from}T00:00:00.000Z`);
      const toDate = new Date(`${to}T23:59:59.999Z`);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ message: 'Invalid date range' }, { status: 400, headers: NO_CACHE });
      }

      const orders = await Order.find({
        status: { $in: ['confirmed', 'active', 'paid', 'completed'] },
        createdAt: { $gte: fromDate, $lte: toDate },
      })
        .select(EXPORT_SELECT)
        .populate('user', 'name email billingAddress')
        .sort({ createdAt: -1 })
        .limit(10000)
        .lean();

      return NextResponse.json({ orders }, { headers: NO_CACHE });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10)), 100);
    const skip = (page - 1) * limit;

    const filter = await buildFilter(searchParams);

    const [orders, total, stats] = await Promise.all([
      Order.find(filter)
        .select(LIST_SELECT)
        .populate('user', 'name email phone billingAddress')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      fetchGlobalStats(),
    ]);

    return NextResponse.json(
      {
        orders,
        stats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      { headers: NO_CACHE },
    );
  } catch (error: any) {
    console.error('[ADMIN/ORDERS][GET] Error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch orders', error: error.message },
      { status: 500, headers: NO_CACHE },
    );
  }
}
