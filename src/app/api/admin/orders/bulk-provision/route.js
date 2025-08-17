import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();

  try {
    const { orderIds, action } = await request.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { message: 'orderIds array is required and cannot be empty' },
        { status: 400 }
      );
    }

    const provisioningService = new AutoProvisioningService();

    if (action === 'provision') {
      // Bulk provision selected orders
      const results = await provisioningService.bulkProvision(orderIds);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      return NextResponse.json({
        success: true,
        message: `Bulk provisioning completed. ${successCount} successful, ${failureCount} failed.`,
        results,
        summary: {
          total: orderIds.length,
          successful: successCount,
          failed: failureCount
        }
      });
    }

    return NextResponse.json(
      { message: 'Invalid action. Use "provision"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Bulk provisioning API error:', error);
    return NextResponse.json(
      { message: 'Bulk provisioning failed', error: error.message },
      { status: 500 }
    );
  }
}

// Get orders that can be auto-provisioned
export async function GET(request) {
  await connectDB();
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'confirmed'; // Changed from 'paid' to 'confirmed'

    // Find orders that are confirmed but not auto-provisioned or failed auto-provisioning
    const orders = await Order.find({
      $or: [
        { status: 'confirmed' },
        { status: 'paid' },
        { status: 'active' }
      ],
      $and: [
        {
          $or: [
            { autoProvisioned: { $ne: true } },
            { provisioningStatus: 'failed' }
          ]
        }
      ]
    }).populate('user', 'name email').sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      orders,
      count: orders.length
    });

  } catch (error) {
    console.error('Get provisionable orders error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch orders', error: error.message },
      { status: 500 }
    );
  }
}
