// app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import IPStock from '@/models/ipStockModel';
import { requireAdmin } from '@/lib/adminAuth';
import { companyIdFromProviderFilter, isCompanyProviderFilter } from '@/lib/adminProviderOptions';

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
  'netbayGroupTag',
  'netbayProductKind',
  'ipStockId',
  'slotIpPackageId',
  'slotIpId',
  'trialVpsPackageId',
  'trialManageCompanyId',
  'resellerVmId',
  'resellerOrderId',
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
  'adminSuspended',
  'adminSuspendMessage',
  'adminSuspendedAt',
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

/** Orders with no captured gateway payment (empty/missing transactionId). */
const NO_TXN_CLAUSE = {
  $or: [
    { transactionId: { $exists: false } },
    { transactionId: null },
    { transactionId: '' },
  ],
};

function paymentFilterClause(value: string | null) {
  if (!value) return null;
  if (value === 'no_txn') {
    // Unpaid via gateway: no transactionId saved.
    return NO_TXN_CLAUSE;
  }
  if (value === 'no_txn_delivered') {
    // Anomaly: server delivered/active but no gateway payment recorded.
    return {
      ...NO_TXN_CLAUSE,
      $and: [
        {
          $or: [
            { status: 'active' },
            { provisioningStatus: 'active' },
            { ipAddress: { $nin: [null, ''] } },
          ],
        },
      ],
    };
  }
  if (value === 'has_txn') {
    return { transactionId: { $nin: [null, ''] } };
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

async function buildProviderFilterClause(provider: string) {
  if (isCompanyProviderFilter(provider)) {
    const companyId = companyIdFromProviderFilter(provider);
    const stocks = await IPStock.find({ company: companyId }).select('_id').lean();
    const stockIds = stocks.map((s) => String(s._id));
    if (!stockIds.length) return { _id: { $in: [] } };
    return { ipStockId: { $in: stockIds } };
  }

  if (provider === 'hostycare') {
    return {
      $or: [
        { provider: { $in: [null, '', 'hostycare'] } },
        { provider: { $exists: false } },
        { hostycareServiceId: { $exists: true, $nin: [null, ''] } },
      ],
    };
  }

  if (provider === 'smartvps') {
    return {
      $or: [{ provider: 'smartvps' }, { smartvpsServiceId: { $exists: true, $nin: [null, ''] } }],
    };
  }

  if (provider === 'advps') {
    return {
      $or: [{ provider: 'advps' }, { advpsServiceId: { $exists: true, $nin: [null, ''] } }],
    };
  }

  if (provider === 'netbay') {
    return {
      $or: [{ provider: 'netbay' }, { netbayServiceId: { $exists: true, $nin: [null, ''] } }],
    };
  }

  if (provider === 'reseller-api') {
    return {
      $or: [
        { provider: 'reseller-api' },
        { resellerVmId: { $exists: true, $nin: [null, ''] } },
        { resellerOrderId: { $exists: true, $nin: [null, ''] } },
      ],
    };
  }

  if (provider === 'slotip') {
    return {
      $or: [
        { provider: 'slotip' },
        { slotIpPackageId: { $exists: true, $nin: [null, ''] } },
      ],
    };
  }

  if (provider === 'trialvps') {
    return {
      $or: [
        { provider: 'trialvps' },
        { trialVpsPackageId: { $exists: true, $nin: [null, ''] } },
      ],
    };
  }

  if (provider === 'kurohost') {
    return {
      $or: [{ provider: 'kurohost' }, { kurohostInstanceId: { $exists: true, $nin: [null, ''] } }],
    };
  }

  if (provider === 'rackato') {
    return {
      $or: [
        { provider: 'rackato' },
        { rackatoOrderId: { $exists: true, $nin: [null, ''] } },
        { rackatoNodeUid: { $exists: true, $nin: [null, ''] } },
      ],
    };
  }

  if (provider === 'hostdzire') {
    return {
      $or: [{ provider: 'hostdzire' }, { hostdzireOrderId: { $exists: true, $nin: [null, ''] } }],
    };
  }

  return { provider };
}

async function buildFilter(searchParams: URLSearchParams) {
  const and: Record<string, unknown>[] = [];

  const statusClause = statusFilterClause(searchParams.get('status'));
  if (statusClause) and.push(statusClause);

  const provider = searchParams.get('provider');
  if (provider) {
    const providerClause = await buildProviderFilterClause(provider);
    if (providerClause) and.push(providerClause);
  }

  const os = searchParams.get('os');
  if (os) {
    and.push({ os: new RegExp(escapeRegex(os), 'i') });
  }

  const provClause = provisioningFilterClause(searchParams.get('provisioningStatus'));
  if (provClause) and.push(provClause);

  const payClause = paymentFilterClause(searchParams.get('paymentStatus'));
  if (payClause) and.push(payClause);

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
  const g = globalThis as typeof globalThis & {
    __oceanAdminOrderStats?: { at: number; stats: unknown };
  };
  const cached = g.__oceanAdminOrderStats;
  if (cached && Date.now() - cached.at < 30000) {
    return cached.stats;
  }

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
  ]).option({ maxTimeMS: 8000 });

  const stats = {
    total: rows?.total || 0,
    pending: rows?.pending || 0,
    confirmed: rows?.confirmed || 0,
    active: rows?.active || 0,
    failed: rows?.failed || 0,
    totalRevenue: rows?.totalRevenue || 0,
  };
  g.__oceanAdminOrderStats = { at: Date.now(), stats };
  return stats;
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
      const gateway = searchParams.get('gateway') || 'all';
      const salesPercent = Math.min(100, Math.max(1, parseInt(searchParams.get('salesPercent') || '100', 10)));

      if (!from || !to) {
        return NextResponse.json({ message: 'from and to dates are required' }, { status: 400, headers: NO_CACHE });
      }
      if (!['razorpay', 'upi', 'all'].includes(gateway)) {
        return NextResponse.json({ message: 'gateway must be razorpay, upi, or all' }, { status: 400, headers: NO_CACHE });
      }

      const fromDate = new Date(`${from}T00:00:00.000+05:30`);
      const toDate = new Date(`${to}T23:59:59.999+05:30`);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ message: 'Invalid date range' }, { status: 400, headers: NO_CACHE });
      }

      const WalletRecharge = (await import('@/models/walletRechargeModel')).default;
      const { buildGstExportRows } = require('@/lib/gstExport');

      const [orders, walletRecharges] = await Promise.all([
        Order.find({
          status: { $in: ['confirmed', 'active', 'paid', 'completed'] },
          createdAt: { $gte: fromDate, $lte: toDate },
        })
          .select(EXPORT_SELECT)
          .populate('user', 'name email billingAddress')
          .sort({ createdAt: -1 })
          .limit(10000)
          .lean(),
        WalletRecharge.find({
          status: 'confirmed',
          $or: [
            { creditedAt: { $gte: fromDate, $lte: toDate } },
            { createdAt: { $gte: fromDate, $lte: toDate } },
          ],
        })
          .populate('user', 'name email billingAddress')
          .sort({ creditedAt: -1, createdAt: -1 })
          .limit(10000)
          .lean(),
      ]);

      const walletOnlyUserIds = [
        ...new Set(
          orders
            .filter((o: any) => {
              const m = String(o.paymentMethod || '').toLowerCase();
              return m === 'wallet' || o.paymentDetails?.walletOnly === true;
            })
            .map((o: any) => String(o.user?._id || o.user || ''))
            .filter(Boolean),
        ),
      ];

      const attributionRecharges =
        walletOnlyUserIds.length > 0
          ? await WalletRecharge.find({
              status: 'confirmed',
              user: { $in: walletOnlyUserIds },
              $or: [{ creditedAt: { $lte: toDate } }, { createdAt: { $lte: toDate } }],
            })
              .select('user paymentMethod paymentDetails creditedAt createdAt amount')
              .sort({ creditedAt: -1, createdAt: -1 })
              .limit(50000)
              .lean()
          : [];

      const rows = buildGstExportRows(orders, walletRecharges, {
        gatewayFilter: gateway,
        salesPercent,
        attributionRecharges,
      });

      return NextResponse.json(
        { rows, gateway, count: rows.length, salesPercent },
        { headers: NO_CACHE },
      );
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10)), 100);
    const skip = (page - 1) * limit;

    const filter = await buildFilter(searchParams);

    const [rawOrders, total, stats] = await Promise.all([
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

    const { attachProviderCompanyNames } = require('@/lib/attachProviderCompanyName');
    const orders = await attachProviderCompanyNames(rawOrders);

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
