import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { getResellerOrderLiveStatus } from '@/lib/resellerSyncApi';
import { loadOrderIpStock } from '@/lib/resellerServerManage';

/** GET /api/v1/reseller/orders/{orderId}/status — online/offline from OceanLinux */
export async function GET(request, { params }) {
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
    const status = await getResellerOrderLiveStatus(order, params.orderId, ipStock);

    return NextResponse.json({
      success: status.success,
      orderId: params.orderId,
      online: status.online,
      powerState: status.powerState,
      ipAddress: status.ipAddress,
      message: status.message,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
