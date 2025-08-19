import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();

  try {
    console.log('Starting batch auto-provisioning for confirmed orders...');

    // Find all confirmed orders that haven't been auto-provisioned yet
    const ordersToProvision = await Order.find({
      status: 'confirmed',
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
        // Check if this is a retry for specific errors
        const isRetry = order.provisioningStatus === 'failed' &&
          order.provisioningError && (
            order.provisioningError.includes('Password strength should not be less than 100') ||
            order.provisioningError.includes('The following IP(s) are used by another VPS')
          );

        if (isRetry) {
          console.log(`Retrying order ${order._id} due to recoverable error: ${order.provisioningError}`);

          // Reset provisioning status for retry
          await Order.findByIdAndUpdate(order._id, {
            provisioningStatus: 'pending',
            provisioningError: '',
          });
        }

        // Attempt provisioning
        const result = await provisioningService.provisionServer(order._id);

        results.push({
          orderId: order._id,
          customerEmail: order.user?.email,
          productName: order.productName,
          success: result.success,
          message: result.message || (result.success ? 'Provisioned successfully' : 'Provisioning failed'),
          isRetry: isRetry,
          details: result
        });

        console.log(`Order ${order._id} provisioning result:`, result.success ? 'SUCCESS' : 'FAILED');

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
          error: error.message
        });
      }
    }

    // Summary statistics
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const retryCount = results.filter(r => r.isRetry).length;

    console.log(`Batch provisioning completed: ${successCount} successful, ${failedCount} failed, ${retryCount} retries`);

    return NextResponse.json({
      success: true,
      message: `Batch provisioning completed: ${successCount} successful, ${failedCount} failed`,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failedCount,
        retries: retryCount
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

// GET endpoint to check status of batch provisioning
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
      // Get recent provisioning activity
      detailsData.recentActivity = await Order.find({
        status: 'confirmed',
        autoProvisioned: true,
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })
      .select('user productName provisioningStatus provisioningError updatedAt')
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
