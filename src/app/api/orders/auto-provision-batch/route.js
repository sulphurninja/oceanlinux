import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();

  try {
    console.log('Starting batch auto-provisioning for confirmed orders...');

    // Helper function to determine OS from product name (same logic as autoProvisioningService)
    const determineOSFromProductName = (productName = '') => {
      const s = String(productName).toLowerCase();

      if (s.includes('windows') || s.includes('rdp') || s.includes('vps')) {
        return 'Windows 2022 64';
      } else if (s.includes('centos')) {
        return 'CentOS 7';
      } else {
        return 'Ubuntu 22'; // default
      }
    };

    // Find all confirmed orders that haven't been auto-provisioned yet
    const ordersToProvision = await Order.find({
      status: 'confirmed',
      $or: [
        // New orders that have never been auto-provisioned
        {
          $and: [
            { $or: [{ autoProvisioned: false }, { autoProvisioned: { $exists: false } }] },
            { $or: [{ provisioningStatus: { $exists: false } }, { provisioningStatus: 'pending' }] }
          ]
        },
        // Only retry specific failed cases
        {
          provisioningStatus: 'failed',
          autoProvisioned: true,
          $or: [
            { provisioningError: { $regex: 'Password strength should not be less than 100', $options: 'i' } },
            { provisioningError: { $regex: 'The following IP\\(s\\) are used by another VPS', $options: 'i' } }
          ]
        }
      ],
      // CRITICAL: Exclude orders that are already successfully provisioned or currently being processed
      provisioningStatus: { $nin: ['active', 'provisioning'] },
      // Also exclude orders that already have server details (manually set or auto-provisioned successfully)
      $nor: [
        {
          $and: [
            { ipAddress: { $exists: true, $ne: '' } },
            { username: { $exists: true, $ne: '' } },
            { provisioningStatus: 'active' }
          ]
        }
      ]
    }).populate('user', 'name email');

    console.log(`Found ${ordersToProvision.length} orders to provision`);

    if (ordersToProvision.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders found that need provisioning',
        results: []
      });
    }

    const provisioningService = new AutoProvisioningService();
    const results = [];

    // Process each order
    for (const order of ordersToProvision) {
      console.log(`Processing order ${order._id} for ${order.user?.email}`);

      try {
        // Double-check the order status before processing (race condition protection)
        const currentOrder = await Order.findById(order._id);
        if (!currentOrder) {
          console.log(`Order ${order._id} no longer exists, skipping`);
          continue;
        }

        // Skip if already being processed or completed
        if (currentOrder.provisioningStatus === 'provisioning' ||
          currentOrder.provisioningStatus === 'active' ||
          (currentOrder.ipAddress && currentOrder.username && currentOrder.provisioningStatus !== 'failed')) {
          console.log(`Order ${order._id} already processed or in progress, skipping`);
          results.push({
            orderId: order._id,
            customerEmail: order.user?.email,
            productName: order.productName,
            success: true,
            message: 'Already provisioned or in progress',
            isRetry: false,
            skipped: true
          });
          continue;
        }

        // 🚨 NEW: Determine and set the correct OS based on product name
        const correctOS = determineOSFromProductName(currentOrder.productName);
        console.log(`Order ${order._id}: Determined OS from product "${currentOrder.productName}": ${correctOS}`);

        // Update the order with correct OS before provisioning
        if (currentOrder.os !== correctOS) {
          console.log(`Order ${order._id}: Updating OS from "${currentOrder.os}" to "${correctOS}"`);
          await Order.findByIdAndUpdate(order._id, { os: correctOS });
        }

        // Check if this is a retry for specific errors
        const isRetry = currentOrder.provisioningStatus === 'failed' &&
          currentOrder.provisioningError && (
            currentOrder.provisioningError.includes('Password strength should not be less than 100') ||
            currentOrder.provisioningError.includes('The following IP(s) are used by another VPS')
          );

        if (isRetry) {
          console.log(`Retrying order ${order._id} due to recoverable error: ${currentOrder.provisioningError}`);

          // Reset provisioning status for retry
          await Order.findByIdAndUpdate(order._id, {
            provisioningStatus: 'pending',
            provisioningError: '',
            os: correctOS // Ensure OS is also updated on retry
          });
        }

        // Attempt provisioning
        const result = await provisioningService.provisionServer(order._id);

        results.push({
          orderId: order._id,
          customerEmail: order.user?.email,
          productName: order.productName,
          detectedOS: correctOS, // Include the detected OS in results
          success: result.success,
          message: result.message || (result.success ? 'Provisioned successfully' : 'Provisioning failed'),
          isRetry: isRetry,
          skipped: false
        });

        console.log(`Order ${order._id} provisioning result:`, result.success ? 'SUCCESS' : 'FAILED');
        console.log(`Order ${order._id} OS set to: ${correctOS}`);

        // Add a small delay between orders to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`Error provisioning order ${order._id}:`, error);

        results.push({
          orderId: order._id,
          customerEmail: order.user?.email,
          productName: order.productName,
          success: false,
          message: `Provisioning error: ${error.message}`,
          isRetry: false,
          error: error.message,
          skipped: false
        });
      }
    }

    // Summary statistics
    const processedResults = results.filter(r => !r.skipped);
    const successCount = processedResults.filter(r => r.success).length;
    const failedCount = processedResults.filter(r => !r.success).length;
    const retryCount = processedResults.filter(r => r.isRetry).length;
    const skippedCount = results.filter(r => r.skipped).length;

    console.log(`Batch provisioning completed: ${successCount} successful, ${failedCount} failed, ${retryCount} retries, ${skippedCount} skipped`);

    return NextResponse.json({
      success: true,
      message: `Batch provisioning completed: ${successCount} successful, ${failedCount} failed, ${skippedCount} skipped`,
      summary: {
        total: results.length,
        processed: processedResults.length,
        successful: successCount,
        failed: failedCount,
        retries: retryCount,
        skipped: skippedCount
      },
      results
    });

  } catch (error) {
    console.error('Batch auto-provisioning error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Batch auto-provisioning failed',
        error: error.message
      },
      { status: 500 }
    );
  }
}

// GET endpoint remains the same...
export async function GET(request) {
  await connectDB();

  try {
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('details') === 'true';

    // Get counts of orders by provisioning status
    const stats = await Order.aggregate([
      {
        $match: { status: 'confirmed' }
      },
      {
        $group: {
          _id: '$provisioningStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get orders that need provisioning
    const ordersNeedingProvisioning = await Order.countDocuments({
      status: 'confirmed',
      $or: [
        // New orders that have never been auto-provisioned
        {
          $and: [
            { $or: [{ autoProvisioned: false }, { autoProvisioned: { $exists: false } }] },
            { $or: [{ provisioningStatus: { $exists: false } }, { provisioningStatus: 'pending' }] }
          ]
        },
        // Only retry specific failed cases
        {
          provisioningStatus: 'failed',
          autoProvisioned: true,
          $or: [
            { provisioningError: { $regex: 'Password strength should not be less than 100', $options: 'i' } },
            { provisioningError: { $regex: 'The following IP\\(s\\) are used by another VPS', $options: 'i' } }
          ]
        }
      ],
      // Exclude orders that are already successfully provisioned or currently being processed
      provisioningStatus: { $nin: ['active', 'provisioning'] },
      // Also exclude orders that already have server details
      $nor: [
        {
          $and: [
            { ipAddress: { $exists: true, $ne: '' } },
            { username: { $exists: true, $ne: '' } },
            { provisioningStatus: 'active' }
          ]
        }
      ]
    });

    // Get failed orders that can be retried (same fix)
    const retryableOrders = await Order.countDocuments({
      status: 'confirmed',
      provisioningStatus: 'failed',
      autoProvisioned: true,
      $or: [
        { provisioningError: { $regex: 'Password strength should not be less than 100', $options: 'i' } },
        { provisioningError: { $regex: 'The following IP\\(s\\) are used by another VPS', $options: 'i' } }
      ]
    });

    let detailsData = {};
    if (includeDetails) {
      // Get recent provisioning activity
      detailsData.recentActivity = await Order.find({
        status: 'confirmed',
        autoProvisioned: true,
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })
        .select('user productName provisioningStatus provisioningError updatedAt os')
        .populate('user', 'email')
        .sort({ updatedAt: -1 })
        .limit(10);
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalConfirmedOrders: stats.reduce((sum, stat) => sum + stat.count, 0),
        needingProvisioning: ordersNeedingProvisioning,
        retryableFailures: retryableOrders,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id || 'pending'] = stat.count;
          return acc;
        }, {})
      },
      ...detailsData
    });

  } catch (error) {
    console.error('Get batch provisioning status error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to get provisioning status',
        error: error.message
      },
      { status: 500 }
    );
  }
}
