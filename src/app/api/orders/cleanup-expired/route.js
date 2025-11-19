import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

/**
 * DELETE expired orders that are 3 or more days past expiry
 * This endpoint should be called by a cron job regularly
 */
export async function POST(request) {
  const startTime = Date.now();
  
  console.log("\n" + "🗑️ ".repeat(40));
  console.log(`[CLEANUP] 🗑️  STARTING EXPIRED ORDERS CLEANUP`);
  console.log(`[CLEANUP] ⏰ Start time: ${new Date().toISOString()}`);
  console.log("🗑️ ".repeat(40));

  try {
    await connectDB();
    console.log('[CLEANUP] ✅ Database connected');

    // Calculate the cutoff date: 3 days ago from now
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    console.log(`[CLEANUP] 📅 Cutoff date: ${threeDaysAgo.toISOString()}`);
    console.log(`[CLEANUP] 🔍 Looking for orders with expiryDate < ${threeDaysAgo.toISOString()}`);

    // Find orders that are expired for 3+ days
    const expiredOrders = await Order.find({
      expiryDate: { 
        $exists: true, 
        $ne: null,
        $lt: threeDaysAgo 
      }
    }).select('_id productName expiryDate status provisioningStatus user createdAt');

    console.log(`[CLEANUP] 📊 Found ${expiredOrders.length} expired orders (3+ days old)`);

    if (expiredOrders.length === 0) {
      console.log('[CLEANUP] ✨ No expired orders to delete');
      return NextResponse.json({
        success: true,
        message: 'No expired orders found',
        deleted: 0,
        timestamp: new Date().toISOString(),
        executionTime: `${Date.now() - startTime}ms`
      });
    }

    // Log details of orders to be deleted
    console.log('[CLEANUP] 📋 Orders to be deleted:');
    expiredOrders.forEach((order, index) => {
      const daysExpired = Math.floor((new Date() - new Date(order.expiryDate)) / (1000 * 60 * 60 * 24));
      console.log(`[CLEANUP]   ${index + 1}. Order ID: ${order._id}`);
      console.log(`[CLEANUP]      Product: ${order.productName}`);
      console.log(`[CLEANUP]      Expired: ${order.expiryDate?.toISOString()} (${daysExpired} days ago)`);
      console.log(`[CLEANUP]      Status: ${order.status} / ${order.provisioningStatus}`);
    });

    // Delete the expired orders
    const deleteResult = await Order.deleteMany({
      _id: { $in: expiredOrders.map(o => o._id) }
    });

    console.log(`[CLEANUP] 🗑️  Successfully deleted ${deleteResult.deletedCount} expired orders`);
    console.log(`[CLEANUP] ⏱️  Execution time: ${Date.now() - startTime}ms`);
    console.log("🗑️ ".repeat(40) + "\n");

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${deleteResult.deletedCount} expired orders`,
      deleted: deleteResult.deletedCount,
      orders: expiredOrders.map(o => ({
        id: o._id.toString(),
        productName: o.productName,
        expiryDate: o.expiryDate,
        daysExpired: Math.floor((new Date() - new Date(o.expiryDate)) / (1000 * 60 * 60 * 24))
      })),
      timestamp: new Date().toISOString(),
      executionTime: `${Date.now() - startTime}ms`
    });

  } catch (error) {
    console.error('[CLEANUP] ❌ Error during cleanup:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Also support GET for testing/manual trigger
export async function GET(request) {
  return POST(request);
}

