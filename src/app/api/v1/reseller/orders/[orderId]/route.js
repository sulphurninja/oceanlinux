import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { sanitizeResellerOrder } from '@/lib/resellerOrderApi';
import {
  getResellerManagementCapabilities,
  listResellerOsTemplates,
  loadOrderIpStock,
} from '@/lib/resellerServerManage';

export async function GET(request, { params }) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const order = await Order.findOne({
      _id: params.orderId,
      resellerId: auth.reseller._id,
    });

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const ipStock = await loadOrderIpStock(order);
    const management = getResellerManagementCapabilities(order, ipStock);
    // Reseller does not need internal provider name — strip it from API response
    const { _provider, ...publicManagement } = management;

    // Best effort: an upstream catalogue outage must not break order lookup.
    let osTemplates = [];
    if (management.available && management.supportedActions.includes('templates')) {
      osTemplates = await listResellerOsTemplates(order, ipStock).catch((err) => {
        console.warn('[RESELLER-ORDER] OS template fetch failed:', err.message);
        return [];
      });
    }

    return NextResponse.json({
      success: true,
      order: sanitizeResellerOrder(order),
      management: {
        ...publicManagement,
        // The live catalogue is authoritative — the static per-provider list is
        // only a fallback for products with no template endpoint.
        osOptions: osTemplates.length ? osTemplates.map((t) => t.name) : publicManagement.osOptions,
        osTemplates,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
