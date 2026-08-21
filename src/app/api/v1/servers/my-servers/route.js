import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { validateAPIKey, apiAuthFailure } from '@/lib/api-utils';

export async function GET(request) {
  try {
    await connectDB();

    const auth = await validateAPIKey(request, { requiredPermission: 'servers:read' });
    if (!auth.success) return apiAuthFailure(auth);

    const orders = await Order.find({
      user: auth.user._id,
      status: { $in: ['confirmed', 'active', 'pending'] },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const servers = orders.map((order) => ({
      id: String(order._id),
      productName: order.productName,
      memory: order.memory,
      ipAddress: order.ipAddress || null,
      status: order.status,
      provisioningStatus: order.provisioningStatus || 'pending',
      price: order.price,
      expiryDate: order.expiryDate || null,
      os: order.os || null,
      createdAt: order.createdAt,
    }));

    return NextResponse.json({
      success: true,
      count: servers.length,
      servers,
    });
  } catch (error) {
    console.error('[V1-MY-SERVERS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
