import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();

  try {
    console.log('Starting batch auto-provisioning for confirmed orders...');

    // Helper function to determine OS from product name
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

    // Simplified query - back to working logic but with race condition protection
    // Simplified query - back to working logic but with race condition protection
    const ordersToProvision = await Order.find({
      status: 'confirmed',
      // Exclude orders that are currently being processed or already completed
      provisioningStatus: { $nin: ['provisioning', 'active'] },
      // Only include orders that need provisioning
      $or: [
        // New orders that haven't been auto-provisioned
        { autoProvisioned: false },
        { autoProvisioned: { $exists: false } },
        // Retry specific failed cases
        {
          provisioningStatus: 'failed',
          autoProvisioned: true,
          $or: [
            { provisioningError: { $regex: 'Password strength should not be less than 100', $options: 'i' } },
            { provisioningError: { $regex: 'The following IP\\(s\\) are used by another VPS', $options: 'i' } }
          ]
        }
      ],
      // Additional safety check - exclude orders that already have complete server details
      $nor: [
        {
          $and: [
            { ipAddress: { $exists: true, $ne: '' } },
            { username: { $exists: true, $ne: '' } },
            { password: { $exists: true, $ne: '' } }
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
        // CRITICAL: Double-check and set provisioning status to prevent race conditions
        const updateResult = await Order.findOneAndUpdate(
          {
            _id: order._id,
            // Only update if not already being processed
            provisioningStatus: { $nin: ['provisioning', 'active'] }
          },
          {
            provisioningStatus: 'provisioning',
            updatedAt: new Date()
          },
          { new: true }
        );

        // If update failed, another process is handling this order
        if (!updateResult) {
          console.log(`Order ${order._id} already being processed by another instance, skipping`);
          results.push({
            orderId: order._id,
            customerEmail: order.user?.email,
            productName: order.productName,
            success: true,
            message: 'Already being processed',
            skipped: true
          });
          continue;
        }

        // Determine and set the correct OS based on product name
        const correctOS = determineOSFromProductName(order.productName);
        console.log(`Order ${order._id}: Determined OS from product "${order.productName}": ${correctOS}`);

        // Update the order with correct OS before provisioning
        if (order.os !== correctOS) {
          console.log(`Order ${order._id}: Updating OS from "${order.os}" to "${correctOS}"`);
          await Order.findByIdAndUpdate(order._id, { os: correctOS });
        }

        // Check if this is a retry
        const isRetry = order.provisioningStatus === 'failed' &&
          order.provisioningError && (
            order.provisioningError.includes('Password strength should not be less than 100') ||
            order.provisioningError.includes('The following IP(s) are used by another VPS')
          );

        if (isRetry) {
          console.log(`Retrying order ${order._id} due to recoverable error: ${order.provisioningError}`);
          // Reset error but keep status as 'provisioning' (already set above)
          await Order.findByIdAndUpdate(order._id, {
            provisioningError: '',
            os: correctOS
          });
        }

        // Attempt provisioning
        const result = await provisioningService.provisionServer(order._id);

        results.push({
          orderId: order._id,
          customerEmail: order.user?.email,
          productName: order.productName,
          detectedOS: correctOS,
          success: result.success,
          message: result.message || (result.success ? 'Provisioned successfully' : 'Provisioning failed'),
          isRetry: isRetry,
          skipped: false
        });

        console.log(`Order ${order._id} provisioning result:`, result.success ? 'SUCCESS' : 'FAILED');

        // Add delay between orders
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`Error provisioning order ${order._id}:`, error);

        // Reset provisioning status on error
        await Order.findByIdAndUpdate(order._id, {
          provisioningStatus: 'failed',
          provisioningError: error.message
        });

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

// GET endpoint - simplified query to match POST logic
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

    // Get orders that need provisioning - same logic as POST
    // Get orders that need provisioning - same logic as POST
    const ordersNeedingProvisioning = await Order.countDocuments({
      status: 'confirmed',
      provisioningStatus: { $nin: ['provisioning', 'active'] },
      $or: [
        { autoProvisioned: false },
        { autoProvisioned: { $exists: false } },
        {
          provisioningStatus: 'failed',
          autoProvisioned: true,
          $or: [
            { provisioningError: { $regex: 'Password strength should not be less than 100', $options: 'i' } },
            { provisioningError: { $regex: 'The following IP\\(s\\) are used by another VPS', $options: 'i' } }
          ]
        }
      ],
      $nor: [
        {
          $and: [
            { ipAddress: { $exists: true, $ne: '' } },
            { username: { $exists: true, $ne: '' } },
            { password: { $exists: true, $ne: '' } }
          ]
        }
      ]
    });

    // Get failed orders that can be retried
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
      detailsData.recentActivity = await Order.find({
        status: 'confirmed',
        autoProvisioned: true,
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
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
