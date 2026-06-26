import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { syncResellerOrderCredentials } from '@/lib/resellerSyncApi';
import { loadOrderIpStock } from '@/lib/resellerServerManage';

/** POST /api/v1/reseller/orders/{orderId}/sync — pull latest IP, username, password from Ocean */
export async function POST(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const order = await Order.findOne({ _id: params.orderId, resellerId: auth.reseller._id });
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const ipStock = await loadOrderIpStock(order);
    const result = await syncResellerOrderCredentials(order, params.orderId, ipStock);

    return NextResponse.json({
      success: result.success,
      orderId: params.orderId,
      ipAddress: result.ipAddress,
      username: result.username,
      password: result.password,
      os: result.os,
      validity: result.validity,
      expiryDate: result.expiryDate,
      daysRemaining: result.daysRemaining,
      online: result.online,
      powerState: result.powerState,
      changed: result.changed,
      credentialsUpdated: result.credentialsUpdated,
      provisioningStatus: result.provisioningStatus,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
