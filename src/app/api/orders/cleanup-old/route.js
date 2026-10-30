import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceCronSecret } from '@/lib/apiSecurity';
const { deleteExpiredOrders } = require('@/lib/cleanupExpiredOrders');
const { deleteStaleNullExpiryOrders } = require('@/lib/cleanupNullExpiryOrders');
const { purgeExpiredSlotIpHistory } = require('@/lib/slotIpExpiryCleanup');

/** Unpaid checkout orders (pending/initiated/processing) older than this are purged. */
const PENDING_ORDER_TTL_DAYS = 2;

/**
 * DELETE old orders that are stuck or abandoned:
 * 1. Expired orders (3+ days past expiry)
 * 2. Pending/unconfirmed orders (2+ days old — unpaid checkout abandoned)
 * 3. Orders with null expiry (30+ days since purchase)
 * 
 * NOTE: Failed orders are NEVER deleted (kept for audit/debugging purposes)
 * 
 * This endpoint should be called by a cron job regularly
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  const { isIstPeakTrafficHour, istPeakSkipBody } = require('@/lib/istPeakTraffic');
  if (isIstPeakTrafficHour()) {
    return NextResponse.json(istPeakSkipBody());
  }

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
      pending: { count: 0, orders: [] },
      nullExpiryStale: { count: 0, orders: [] },
      slotIpStale: { count: 0, orders: [], ipsRemoved: 0 },
    };

    // 1. DELETE EXPIRED ORDERS (3+ days past expiry)
    console.log('\n[CLEANUP-ALL] 🗑️  Phase 1: Deleting expired orders...');

    const expiredResult = await deleteExpiredOrders();
    if (expiredResult.matchedCount > 0) {
      console.log(`[CLEANUP-ALL]   Found ${expiredResult.matchedCount} expired orders`);
      results.expired.count = expiredResult.deletedCount;
      results.expired.orders = expiredResult.orders;
      console.log(`[CLEANUP-ALL]   ✅ Deleted ${expiredResult.deletedCount} expired orders`);
    } else {
      console.log(`[CLEANUP-ALL]   ✨ No expired orders found`);
    }

    const pendingCutoff = new Date();
    pendingCutoff.setDate(pendingCutoff.getDate() - PENDING_ORDER_TTL_DAYS);

    // 2. SKIP FAILED ORDERS (NEVER DELETE - kept for audit/debugging)
    console.log('\n[CLEANUP-ALL] 🔒 Phase 2: Checking failed orders...');
    const failedOrdersCount = await Order.countDocuments({
      $or: [
        { status: 'failed' },
        { provisioningStatus: 'failed' }
      ]
    });
    console.log(`[CLEANUP-ALL]   ℹ️  Found ${failedOrdersCount} failed orders (PRESERVED - never deleted)`);
    console.log(`[CLEANUP-ALL]   ℹ️  Failed orders are kept for debugging and audit purposes`);

    // 3. DELETE PENDING/UNCONFIRMED ORDERS (2+ days old, never paid)
    console.log(`\n[CLEANUP-ALL] 🗑️  Phase 3: Deleting pending orders older than ${PENDING_ORDER_TTL_DAYS} days...`);
    
    const pendingOrders = await Order.find({
      status: { $in: ['pending', 'initiated', 'processing'] },
      createdAt: { $lt: pendingCutoff }
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

    // 4. DELETE ORDERS WITH NULL EXPIRY (30+ days since purchase)
    console.log('\n[CLEANUP-ALL] 🗑️  Phase 4: Deleting stale orders with null expiry (30+ days old)...');
    const nullExpiryResult = await deleteStaleNullExpiryOrders({ olderThanDays: 30, dryRun: false });
    results.nullExpiryStale.count = nullExpiryResult.deletedCount;
    results.nullExpiryStale.orders = nullExpiryResult.orders;
    console.log(`[CLEANUP-ALL]   ✅ Deleted ${nullExpiryResult.deletedCount} null-expiry stale orders`);

    // 5. PURGE SLOT IP history (30+ days): delete orders + remove IP rows from packages
    console.log('\n[CLEANUP-ALL] 🗑️  Phase 5: Purging expired Slot IP orders + package rows (30+ days)...');
    const slotIpResult = await purgeExpiredSlotIpHistory({ olderThanDays: 30, dryRun: false });
    results.slotIpStale.count = slotIpResult.ordersDeleted;
    results.slotIpStale.orders = slotIpResult.deletedOrders || [];
    results.slotIpStale.ipsRemoved = slotIpResult.ipsRemoved || 0;
    console.log(
      `[CLEANUP-ALL]   ✅ Slot IP purge: ${slotIpResult.ordersDeleted} orders, ${slotIpResult.ipsRemoved} package IPs removed`
    );

    const totalDeleted = results.expired.count + results.pending.count + results.nullExpiryStale.count + results.slotIpStale.count;
    
    console.log('\n[CLEANUP-ALL] 📊 CLEANUP SUMMARY:');
    console.log(`[CLEANUP-ALL]   Expired orders deleted: ${results.expired.count}`);
    console.log(`[CLEANUP-ALL]   Failed orders preserved: ${failedOrdersCount} (never deleted)`);
    console.log(`[CLEANUP-ALL]   Pending orders deleted: ${results.pending.count}`);
    console.log(`[CLEANUP-ALL]   Null-expiry stale deleted: ${results.nullExpiryStale.count}`);
    console.log(`[CLEANUP-ALL]   Slot IP stale deleted: ${results.slotIpStale.count}`);
    console.log(`[CLEANUP-ALL]   Slot IP rows removed: ${results.slotIpStale.ipsRemoved}`);
    console.log(`[CLEANUP-ALL]   Total deleted: ${totalDeleted}`);
    console.log(`[CLEANUP-ALL] ⏱️  Execution time: ${Date.now() - startTime}ms`);
    console.log("🧹".repeat(40) + "\n");

    return NextResponse.json({
      success: true,
      message: `Successfully cleaned up ${totalDeleted} orders (failed orders preserved)`,
      totalDeleted,
      breakdown: {
        expired: results.expired.count,
        failedPreserved: failedOrdersCount,
        pending: results.pending.count,
        nullExpiryStale: results.nullExpiryStale.count,
        slotIpStale: results.slotIpStale.count,
        slotIpRowsRemoved: results.slotIpStale.ipsRemoved,
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

