import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { resolveOrderForUserOrAdmin } from '@/lib/resolveOrderAccess';
import { ensureOrderRenewalStockLink } from '@/lib/orderRenewalPricingServer';
const { maybeSyncResellerOrderOnFetch } = require('@/lib/resellerApiOrderSync');

export async function GET(request, { params }) {
    try {
        await connectDB();

        const orderId = params.id;
        const resolved = await resolveOrderForUserOrAdmin(request, orderId, { lean: true });
        if (resolved.error) return resolved.error;

        let order = resolved.order;
        order = await maybeSyncResellerOrderOnFetch(order);

        if (order?.ipStockId && ['active', 'confirmed'].includes(String(order.status || ''))) {
            const orderDoc = await Order.findById(order._id);
            if (orderDoc) {
                await ensureOrderRenewalStockLink(orderDoc);
                order = await Order.findById(order._id).lean();
            }
        }

        return NextResponse.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { message: 'Failed to fetch order', error: error.message },
            { status: 500 }
        );
    }
}