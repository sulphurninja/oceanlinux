import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';

/**
 * DELETE old orders that are stuck or abandoned:
 * 1. Expired orders (3+ days past expiry)
 * 2. Failed orders (7+ days old)
 * 3. Pending/unconfirmed orders (3+ days old)
 * 
 * This endpoint should be called by a cron job regularly
 */
export async function POST(request) {
  const startTime = Date.now();
  
  console.log("\n" + "🧹".repeat(40));
  console.log(`[CLEANUP-ALL] 🧹 STARTING COMPREHENSIVE ORDER CLEANUP`);
  console.log(`[CLEANUP-ALL] ⏰ Start time: ${new Date().toISOString()}`);
  console.log("🧹".repeat(40));

  try {
    await connectDB();
    console.log('[CLEANUP-ALL] ✅ Database connected');

    const results = {
      expired: { count: 0, orders: [] },
      failed: { count: 0, orders: [] },
      pending: { count: 0, orders: [] }
    };

    // 1. DELETE EXPIRED ORDERS (3+ days past expiry)
    console.log('\n[CLEANUP-ALL] 🗑️  Phase 1: Deleting expired orders...');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const expiredOrders = await Order.find({
      expiryDate: { 
        $exists: true, 
        $ne: null,
        $lt: threeDaysAgo 
      }
    }).select('_id productName expiryDate status provisioningStatus');

    if (expiredOrders.length > 0) {
      console.log(`[CLEANUP-ALL]   Found ${expiredOrders.length} expired orders`);
      const deleteExpired = await Order.deleteMany({
        _id: { $in: expiredOrders.map(o => o._id) }
      });
      results.expired.count = deleteExpired.deletedCount;
      results.expired.orders = expiredOrders.map(o => ({
        id: o._id.toString(),
        productName: o.productName,
        expiryDate: o.expiryDate,
        daysExpired: Math.floor((new Date() - new Date(o.expiryDate)) / (1000 * 60 * 60 * 24))
      }));
      console.log(`[CLEANUP-ALL]   ✅ Deleted ${deleteExpired.deletedCount} expired orders`);
    } else {
      console.log(`[CLEANUP-ALL]   ✨ No expired orders found`);
    }

    // 2. DELETE FAILED ORDERS (7+ days old)
    console.log('\n[CLEANUP-ALL] 🗑️  Phase 2: Deleting old failed orders...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const failedOrders = await Order.find({
      $or: [
        { status: 'failed' },
        { provisioningStatus: 'failed' }
      ],
      createdAt: { $lt: sevenDaysAgo }
    }).select('_id productName status provisioningStatus createdAt');

    if (failedOrders.length > 0) {
      console.log(`[CLEANUP-ALL]   Found ${failedOrders.length} old failed orders`);
      const deleteFailed = await Order.deleteMany({
        _id: { $in: failedOrders.map(o => o._id) }
      });
      results.failed.count = deleteFailed.deletedCount;
      results.failed.orders = failedOrders.map(o => ({
        id: o._id.toString(),
        productName: o.productName,
        status: o.status,
        createdAt: o.createdAt,
        daysOld: Math.floor((new Date() - new Date(o.createdAt)) / (1000 * 60 * 60 * 24))
      }));
      console.log(`[CLEANUP-ALL]   ✅ Deleted ${deleteFailed.deletedCount} failed orders`);
    } else {
      console.log(`[CLEANUP-ALL]   ✨ No old failed orders found`);
    }

    // 3. DELETE PENDING/UNCONFIRMED ORDERS (3+ days old)
    console.log('\n[CLEANUP-ALL] 🗑️  Phase 3: Deleting old pending orders...');
    
    const pendingOrders = await Order.find({
      status: { $in: ['pending', 'initiated', 'processing'] },
      createdAt: { $lt: threeDaysAgo }
    }).select('_id productName status createdAt');

    if (pendingOrders.length > 0) {
      console.log(`[CLEANUP-ALL]   Found ${pendingOrders.length} old pending orders`);
      const deletePending = await Order.deleteMany({
        _id: { $in: pendingOrders.map(o => o._id) }
      });
      results.pending.count = deletePending.deletedCount;
      results.pending.orders = pendingOrders.map(o => ({
        id: o._id.toString(),
        productName: o.productName,
        status: o.status,
        createdAt: o.createdAt,
        daysOld: Math.floor((new Date() - new Date(o.createdAt)) / (1000 * 60 * 60 * 24))
      }));
      console.log(`[CLEANUP-ALL]   ✅ Deleted ${deletePending.deletedCount} pending orders`);
    } else {
      console.log(`[CLEANUP-ALL]   ✨ No old pending orders found`);
    }

    const totalDeleted = results.expired.count + results.failed.count + results.pending.count;
    
    console.log('\n[CLEANUP-ALL] 📊 CLEANUP SUMMARY:');
    console.log(`[CLEANUP-ALL]   Expired orders: ${results.expired.count}`);
    console.log(`[CLEANUP-ALL]   Failed orders: ${results.failed.count}`);
    console.log(`[CLEANUP-ALL]   Pending orders: ${results.pending.count}`);
    console.log(`[CLEANUP-ALL]   Total deleted: ${totalDeleted}`);
    console.log(`[CLEANUP-ALL] ⏱️  Execution time: ${Date.now() - startTime}ms`);
    console.log("🧹".repeat(40) + "\n");

    return NextResponse.json({
      success: true,
      message: `Successfully cleaned up ${totalDeleted} orders`,
      totalDeleted,
      breakdown: {
        expired: results.expired.count,
        failed: results.failed.count,
        pending: results.pending.count
      },
      details: results,
      timestamp: new Date().toISOString(),
      executionTime: `${Date.now() - startTime}ms`
    });

  } catch (error) {
    console.error('[CLEANUP-ALL] ❌ Error during cleanup:', error);
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

