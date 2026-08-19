import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import Reseller from '@/models/resellerModel';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId: string;
    try {
      userId = getDataFromToken(request);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '30d';

    const now = new Date();
    const daysAgo = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const userOid = new mongoose.Types.ObjectId(String(userId));
    const userMatch = {
      $in: [userOid, String(userId)],
    };

    const [agg] = await Order.aggregate([
      { $match: { user: userMatch } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: { $ifNull: ['$price', 0] } },
                pendingOrders: {
                  $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
                },
                failedOrders: {
                  $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
                },
                completedOrders: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                activeServices: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$status', 'completed'] },
                          { $eq: ['$provisioningStatus', 'active'] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          recent: [
            { $match: { createdAt: { $gte: startDate } } },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                productName: 1,
                memory: 1,
                price: 1,
                status: 1,
                provisioningStatus: 1,
                createdAt: 1,
              },
            },
          ],
          monthly: [
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            { $project: { price: 1, createdAt: 1 } },
          ],
        },
      },
    ]);

    const totals = agg?.totals?.[0] || {};
    const recentOrders = agg?.recent || [];
    const monthlyRows = agg?.monthly || [];

    const monthlySpending = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthTotal = monthlyRows.reduce((sum: number, order: { price?: number; createdAt: Date }) => {
        const orderDate = new Date(order.createdAt);
        if (orderDate >= monthStart && orderDate <= monthEnd) {
          return sum + (order.price || 0);
        }
        return sum;
      }, 0);
      monthlySpending.push(monthTotal);
    }

    const user = await User.findById(userId).select('userType resellerId').lean();
    let resellerInfo = null;

    if (user?.userType === 'reseller' && user?.resellerId) {
      const reseller = await Reseller.findById(user.resellerId)
        .select('wallet stats.totalSpent')
        .lean();
      if (reseller) {
        resellerInfo = {
          balance: reseller.wallet?.balance || 0,
          currency: reseller.wallet?.currency || 'INR',
          creditLimit: reseller.wallet?.creditLimit || 0,
          totalSpent: reseller.stats?.totalSpent || 0,
        };
      }
    }

    return NextResponse.json({
      totalOrders: totals.totalOrders || 0,
      activeServices: totals.activeServices || 0,
      totalSpent: totals.totalSpent || 0,
      pendingOrders: totals.pendingOrders || 0,
      recentOrders,
      monthlySpending,
      orderStatusBreakdown: {
        completed: totals.completedOrders || 0,
        pending: totals.pendingOrders || 0,
        failed: totals.failedOrders || 0,
      },
      resellerWallet: resellerInfo,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
