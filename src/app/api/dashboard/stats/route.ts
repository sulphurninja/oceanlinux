import { NextRequest, NextResponse } from 'next/server';
import Order from '@/models/orderModel';
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

    // Calculate date range based on timeframe
    const now = new Date();
    const daysAgo = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));

    // Get user's orders using the userId from token
    const allOrders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    const recentOrders = await Order.find({
      user: userId,
      createdAt: { $gte: startDate }
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Calculate stats
    const totalOrders = allOrders.length;
    const activeServices = allOrders.filter(order =>
      order.status === 'completed' || order.provisioningStatus === 'active'
    ).length;

    const totalSpent = allOrders.reduce((sum, order) => sum + (order.price || 0), 0);
    const pendingOrders = allOrders.filter(order => order.status === 'pending').length;

    // Order status breakdown
    const orderStatusBreakdown = {
      completed: allOrders.filter(order => order.status === 'completed').length,
      pending: allOrders.filter(order => order.status === 'pending').length,
      failed: allOrders.filter(order => order.status === 'failed').length,
    };

    // Monthly spending (last 6 months)
    const monthlySpending = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= monthStart && orderDate <= monthEnd;
      });

      const monthTotal = monthOrders.reduce((sum, order) => sum + (order.price || 0), 0);
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
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
