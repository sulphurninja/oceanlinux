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
        return 'Ubuntu 22';
      }
    };

    // Reset any orders stuck in provisioning for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await Order.updateMany(
      {
        status: 'confirmed',
        provisioningStatus: 'provisioning',
        updatedAt: { $lt: tenMinutesAgo }
      },
      {
        provisioningStatus: 'failed',
        provisioningError: 'Provisioning timed out - API timeout or server error',
        updatedAt: new Date()
      }
    );

    // Find orders that need provisioning - SIMPLIFIED QUERY
    const ordersToProvision = await Order.find({
      status: 'confirmed',
      $or: [
        // New orders
        { autoProvisioned: false },
        { autoProvisioned: { $exists: false } },
        // Failed orders that can be retried
        {
          provisioningStatus: 'failed',
          autoProvisioned: true,
          $or: [
            { provisioningError: { $regex: 'Password strength should not be less than 100', $options: 'i' } },
            { provisioningError: { $regex: 'The following IP\\(s\\) are used by another VPS', $options: 'i' } },
            { provisioningError: { $regex: 'timed out', $options: 'i' } }, // Include timeout errors
            { provisioningError: { $regex: 'API timeout', $options: 'i' } }
          ]
        }
      ],
      // Exclude currently processing or completed
      provisioningStatus: { $nin: ['provisioning', 'active'] }
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

    // Process each order with timeout handling
    for (const order of ordersToProvision) {
      console.log(`Processing order ${order._id} for ${order.user?.email}`);

      try {
        // Set provisioning status atomically
        const updateResult = await Order.findOneAndUpdate(
          {
            _id: order._id,
            provisioningStatus: { $nin: ['provisioning', 'active'] }
          },
          {
            provisioningStatus: 'provisioning',
            updatedAt: new Date()
          },
          { new: true }
        );

        if (!updateResult) {
          console.log(`Order ${order._id} already being processed, skipping`);
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

        // Set OS
        const correctOS = determineOSFromProductName(order.productName);
        if (order.os !== correctOS) {
          await Order.findByIdAndUpdate(order._id, { os: correctOS });
        }

        // Check if retry
        const isRetry = order.provisioningStatus === 'failed' && order.provisioningError;
        if (isRetry) {
          console.log(`Retrying order ${order._id} due to: ${order.provisioningError}`);
          await Order.findByIdAndUpdate(order._id, { provisioningError: '' });
        }

        // CRITICAL: Add timeout to prevent hanging
        const provisioningPromise = provisioningService.provisionServer(order._id);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Provisioning timeout after 5 minutes')), 5 * 60 * 1000)
        );

        const result = await Promise.race([provisioningPromise, timeoutPromise]);

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

        console.log(`Order ${order._id} result:`, result.success ? 'SUCCESS' : 'FAILED');

        // Delay between orders
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`Error provisioning order ${order._id}:`, error);

        // Reset status on error
        await Order.findByIdAndUpdate(order._id, {
          provisioningStatus: 'failed',
          provisioningError: error.message.includes('timeout') ?
            'Provisioning timed out - API timeout or server error' :
            error.message
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

    // Summary
    const processedResults = results.filter(r => !r.skipped);
    const successCount = processedResults.filter(r => r.success).length;
    const failedCount = processedResults.filter(r => !r.success).length;
    const retryCount = processedResults.filter(r => r.isRetry).length;
    const skippedCount = results.filter(r => r.skipped).length;

    console.log(`Batch completed: ${successCount} successful, ${failedCount} failed, ${retryCount} retries, ${skippedCount} skipped`);

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

// ... rest of the GET method remains the same ...

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
