import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret } from '@/lib/apiSecurity';
const { deleteExpiredOrders } = require('@/lib/cleanupExpiredOrders');

/**
 * DELETE expired orders that are 3 or more days past expiry
 * This endpoint should be called by a cron job regularly
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  const startTime = Date.now();
  
  console.log("\n" + "🗑️ ".repeat(40));
  console.log(`[CLEANUP] 🗑️  STARTING EXPIRED ORDERS CLEANUP`);
  console.log(`[CLEANUP] ⏰ Start time: ${new Date().toISOString()}`);
  console.log("🗑️ ".repeat(40));

  try {
    await connectDB();
    console.log('[CLEANUP] ✅ Database connected');

    const result = await deleteExpiredOrders();
    const expiredOrders = result.orders;

    console.log(`[CLEANUP] 📊 Found ${result.matchedCount} expired orders (3+ days old)`);

    if (result.matchedCount === 0) {
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
    console.log('[CLEANUP] 📋 Orders deleted:');
    expiredOrders.forEach((order, index) => {
      console.log(`[CLEANUP]   ${index + 1}. Order ID: ${order.id}`);
      console.log(`[CLEANUP]      Product: ${order.productName}`);
      console.log(`[CLEANUP]      Expired: ${order.expiryDate} (${order.daysExpired} days ago)`);
    });

    console.log(`[CLEANUP] 🗑️  Successfully deleted ${result.deletedCount} expired orders`);
    console.log(`[CLEANUP] ⏱️  Execution time: ${Date.now() - startTime}ms`);
    console.log("🗑️ ".repeat(40) + "\n");

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} expired orders`,
      deleted: result.deletedCount,
      orders: expiredOrders,
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

