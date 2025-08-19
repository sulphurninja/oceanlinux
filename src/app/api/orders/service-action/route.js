import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
const HostycareAPI = require('@/services/hostycareApi');

export async function GET(request) {
  try {
    await connectDB();
    const userId = await getDataFromToken(request);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ message: 'orderId is required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    if (!order.hostycareServiceId) return NextResponse.json({ message: 'No Hostycare service attached' }, { status: 400 });

    const api = new HostycareAPI();
    const [details, info] = await Promise.all([
      api.getServiceDetails(order.hostycareServiceId),
      api.getServiceInfo(order.hostycareServiceId).catch(() => null)
    ]);

    return NextResponse.json({ success: true, serviceId: order.hostycareServiceId, details, info });
  } catch (error) {
    console.error('[SERVICE-ACTION][GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const userId = await getDataFromToken(request);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { orderId, action, payload } = await request.json();
    if (!orderId || !action) return NextResponse.json({ message: 'orderId and action are required' }, { status: 400 });

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    if (!order.hostycareServiceId) return NextResponse.json({ message: 'No Hostycare service attached' }, { status: 400 });

    const api = new HostycareAPI();
    const sid = order.hostycareServiceId;
    let result;

    switch (action) {
      case 'start':
        result = await api.startService(sid);
        break;
      case 'stop':
        result = await api.stopService(sid);
        break;
      case 'reboot':
        result = await api.rebootService(sid);
        break;
      case 'changepassword':
        if (!payload?.password) return NextResponse.json({ message: 'password is required' }, { status: 400 });
        result = await api.changePassword(sid, payload.password);
        // Sync the new password into our Order record
        await Order.findByIdAndUpdate(orderId, { password: payload.password });
        break;
      case 'reinstall':
        if (!payload?.password) return NextResponse.json({ message: 'password is required' }, { status: 400 });
        result = await api.reinstallService(sid, payload.password);
        // Also update local password to reflect the reinstall credential
        await Order.findByIdAndUpdate(orderId, { password: payload.password });
        break;
      case 'templates':
        result = await api.getReinstallTemplates(sid);
        break;
      case 'details':
        result = await api.getServiceDetails(sid);
        break;
      default:
        return NextResponse.json({ message: 'Unsupported action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, action, result });
  } catch (error) {
    console.error('[SERVICE-ACTION][POST] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
