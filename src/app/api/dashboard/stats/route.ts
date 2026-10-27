import { NextRequest, NextResponse } from 'next/server';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import Reseller from '@/models/resellerModel';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Check if token exists
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID from token using your helper function
    let userId;
    try {
      userId = getDataFromToken(request);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '30d';

    const cacheKey = `${userId}:${timeframe}`;
    const g = global as typeof globalThis & {
      __oceanDashboardStats?: Map<string, { at: number; stats: unknown }>;
    };
    const statsCache = g.__oceanDashboardStats || (g.__oceanDashboardStats = new Map());
    const cachedStats = statsCache.get(cacheKey);
    if (cachedStats && Date.now() - cachedStats.at < 20000) {
      return NextResponse.json(cachedStats.stats);
    }

    // Calculate date range based on timeframe
    const now = new Date();
    const daysAgo = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));

    const [allOrders, user] = await Promise.all([
      Order.find({ user: userId })
        .select('productName memory price status provisioningStatus createdAt')
        .lean()
        .maxTimeMS(8000),
      User.findById(userId).select('userType resellerId').lean().maxTimeMS(4000),
    ]);

    const recentOrders = allOrders
      .filter((order) => new Date(order.createdAt) >= startDate)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    let resellerInfo = null;
    if (user?.userType === 'reseller' && user?.resellerId) {
      const reseller = await Reseller.findById(user.resellerId).select('wallet stats').lean();
      if (reseller) {
        resellerInfo = {
          balance: reseller.wallet?.balance || 0,
          currency: reseller.wallet?.currency || 'INR',
          creditLimit: reseller.wallet?.creditLimit || 0,
          totalSpent: reseller.stats?.totalSpent || 0
        };
      }
    }

    const totalOrders = allOrders.length;
    const activeServices = allOrders.filter(order =>
      order.status === 'completed' || order.provisioningStatus === 'active'
    ).length;

    const totalSpent = allOrders.reduce((sum, order) => sum + (order.price || 0), 0);
    const pendingOrders = allOrders.filter(order => order.status === 'pending').length;

    const orderStatusBreakdown = {
      completed: allOrders.filter(order => order.status === 'completed').length,
      pending: pendingOrders,
      failed: allOrders.filter(order => order.status === 'failed').length,
    };

    const monthlySpending = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthTotal = allOrders
        .filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= monthStart && orderDate <= monthEnd;
        })
        .reduce((sum, order) => sum + (order.price || 0), 0);
      monthlySpending.push(monthTotal);
    }

    const stats = {
      totalOrders,
      activeServices,
      totalSpent,
      pendingOrders,
      recentOrders: recentOrders.map(order => ({
        _id: order._id,
        productName: order.productName,
        memory: order.memory,
        price: order.price,
        status: order.status,
        provisioningStatus: order.provisioningStatus,
        createdAt: order.createdAt,
      })),
      monthlySpending,
      orderStatusBreakdown,
      resellerWallet: resellerInfo,
    };

    statsCache.set(cacheKey, { at: Date.now(), stats });
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
