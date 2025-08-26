import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
const AutoProvisioningService = require('@/services/autoProvisioningService');

export async function POST(request) {
  await connectDB();
  try {
    const { orderId, orderIds } = await request.json();
    const provisioningService = new AutoProvisioningService();

    if (orderId) {
      // Provision single order
      const result = await provisioningService.provisionServer(orderId);

      return NextResponse.json({
        success: result.success,
        message: result.success ? 'Server provisioned successfully' : 'Provisioning failed',
        details: result
      });

    } else if (orderIds && Array.isArray(orderIds)) {
      // Bulk provision multiple orders
      const results = await provisioningService.bulkProvision(orderIds);

      return NextResponse.json({
        success: true,
        message: 'Bulk provisioning completed',
        results
      });

    } else {
      return NextResponse.json(
        { message: 'Either orderId or orderIds array is required' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Provisioning API error:', error);
    return NextResponse.json(
      { message: 'Provisioning failed', error: error.message },
      { status: 500 }
    );
  }
}

// Get provisioning status
export async function GET(request) {
  await connectDB();

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { message: 'orderId is required' },
        { status: 400 }
      );
    }
    const order = await Order.findById(orderId).select(
      'provisioningStatus provisioningError hostycareServiceId autoProvisioned'
    );
    if (!order) {
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      orderId,
      provisioningStatus: order.provisioningStatus,
      provisioningError: order.provisioningError,
      hostycareServiceId: order.hostycareServiceId,
      autoProvisioned: order.autoProvisioned
    });

  } catch (error) {
    console.error('Get provisioning status error:', error);
    return NextResponse.json(
      { message: 'Failed to get provisioning status', error: error.message },
      { status: 500 }
    );
  }
}
