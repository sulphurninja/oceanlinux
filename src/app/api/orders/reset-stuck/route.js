import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceCronSecret } from '@/lib/apiSecurity';

export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  await connectDB();

  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuckOrders = await Order.find({
      status: 'confirmed',
      provisioningStatus: 'provisioning',
      updatedAt: { $lt: tenMinutesAgo }
    });

    console.log(`Found ${stuckOrders.length} stuck orders to reset`);

    const results = [];
    for (const order of stuckOrders) {
      await Order.findByIdAndUpdate(order._id, {
        provisioningStatus: 'pending',
        provisioningError: 'Reset from stuck provisioning state',
        updatedAt: new Date()
      });

      results.push({
        orderId: order._id,
        customerEmail: order.user?.email,
        wasStuckSince: order.updatedAt
      });
    }

    return NextResponse.json({
      success: true,
      message: `Reset ${stuckOrders.length} stuck orders`,
      results
    });

  } catch (error) {
    console.error('Reset stuck orders error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
