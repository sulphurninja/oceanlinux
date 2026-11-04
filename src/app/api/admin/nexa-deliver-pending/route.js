import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';

const { resumeNexaOrder } = require('@/lib/nexaPendingSync');

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Admin: pull Nexa status/list for held nexaOrderId rows and finalize delivery. */
export async function POST(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();
    require('@/models/userModel').default;

    const body = await request.json().catch(() => ({}));
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String).filter(Boolean) : [];
    const pays = Array.isArray(body.pays) ? body.pays.map(String).filter(Boolean) : [];

    let orders = [];
    if (orderIds.length) {
      orders = await Order.find({ _id: { $in: orderIds } }).lean();
    } else if (pays.length) {
      orders = await Order.find({
        $or: pays.flatMap((pay) => [
          { transactionId: pay },
          { gatewayOrderId: pay },
          { clientTxnId: { $regex: pay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } },
        ]),
      }).lean();
    } else {
      return NextResponse.json({ success: false, message: 'Send orderIds or pays[]' }, { status: 400 });
    }

    const results = [];
    for (const order of orders) {
      const stock = order.ipStockId
        ? await IPStock.findById(order.ipStockId).select('defaultConfigurations company').lean()
        : null;
      if (!stock) {
        results.push({ orderId: String(order._id), action: 'error', message: 'no stock' });
        continue;
      }
      if (order.ipAddress && order.provisioningStatus === 'active') {
        results.push({
          orderId: String(order._id),
          action: 'already_active',
          ip: order.ipAddress,
          nexaOrderId: order.nexaOrderId,
        });
        continue;
      }
      try {
        const fresh = await Order.findById(order._id);
        const applied = await resumeNexaOrder(fresh, stock, { holdIfMissing: false });
        const after = await Order.findById(order._id).select('status provisioningStatus ipAddress username nexaOrderId').lean();
        results.push({
          orderId: String(order._id),
          pay: order.transactionId,
          nexaOrderId: order.nexaOrderId,
          ...applied,
          ip: after?.ipAddress || '',
          status: after?.status,
          provisioningStatus: after?.provisioningStatus,
        });
      } catch (err) {
        results.push({ orderId: String(order._id), action: 'error', message: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[ADMIN-NEXA-DELIVER]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Nexa deliver failed' },
      { status: 500 }
    );
  }
}
