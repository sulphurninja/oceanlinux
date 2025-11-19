import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await connectDB();

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Aggregate orders from the last 7 days to find most popular products
    const popularProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          status: { $in: ['active', 'pending', 'confirmed'] } // Only count successful/active orders
        }
      },
      {
        $group: {
          _id: '$productName',
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$price' },
          avgPrice: { $avg: '$price' }
        }
      },
      {
        $sort: { orderCount: -1 }
      },
      {
        $limit: 4 // Get top 4 most popular plans
      }
    ]);

    // If no orders in the last 7 days, return empty array
    if (popularProducts.length === 0) {
      return NextResponse.json({
        success: true,
        plans: [],
        message: 'No orders found in the last 7 days'
      });
    }

    // Format the response
    const formattedPlans = popularProducts.map((product, index) => ({
      name: product._id,
      orderCount: product.orderCount,
      avgPrice: Math.round(product.avgPrice),
      totalRevenue: product.totalRevenue,
      rank: index + 1
    }));

    return NextResponse.json({
      success: true,
      plans: formattedPlans,
      generatedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error fetching popular plans:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch popular plans',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

