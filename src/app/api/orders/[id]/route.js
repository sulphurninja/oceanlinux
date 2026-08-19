import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { resolveOrderForUserOrAdmin } from '@/lib/resolveOrderAccess';
import { ensureOrderRenewalStockLink } from '@/lib/orderRenewalPricingServer';
const { maybeSyncResellerOrderOnFetch } = require('@/lib/resellerApiOrderSync');
const { syncSingleOrderExpiryFromPanel } = require('@/lib/companyResellerInventorySync');
const { sanitizeOrderForCustomer } = require('@/lib/customerFacingErrors');
const Company = require('@/models/companyModel');
const IPStock = require('@/models/ipStockModel');
const { resolveJoyApiForOrder } = require('@/lib/companyJoyApi');

export async function GET(request, { params }) {
    try {
        await connectDB();

        const orderId = params.id;
        const resolved = await resolveOrderForUserOrAdmin(request, orderId, { lean: true });
        if (resolved.error) return resolved.error;

        let order = resolved.order;

        // Prime expiry is source of truth — wait so the user sees the panel date.
        try {
            const expirySync = await syncSingleOrderExpiryFromPanel(order, { force: false });
            if (expirySync?.order) order = expirySync.order;
        } catch (syncErr) {
            console.warn('[orders/:id] panel expiry sync failed:', syncErr.message);
        }

        void maybeSyncResellerOrderOnFetch(order).catch((syncErr) => {
            console.warn('[orders/:id] background panel credential sync failed:', syncErr.message);
        });

        if (order?.ipStockId && ['active', 'confirmed'].includes(String(order.status || ''))) {
            const orderDoc = await Order.findById(order._id);
            if (orderDoc) {
                await ensureOrderRenewalStockLink(orderDoc);
                order = await Order.findById(order._id).lean();
            }
        }

        const joyMatch = await resolveJoyApiForOrder(order, { Company, IPStock });
        if (joyMatch.config) {
            order = {
                ...order,
                companyAutomation: {
                    enabled: true,
                    provider: 'joy',
                    companyName: joyMatch.companyName,
                    matchedBy: joyMatch.matchedBy,
                },
            };
        }

        return NextResponse.json(sanitizeOrderForCustomer(order, { isAdmin: resolved.isAdmin }));
    } catch (error) {
        console.error('Error fetching order:', error);
        const { customerServiceErrorMessage } = require('@/lib/customerFacingErrors');
        return NextResponse.json(
            { message: customerServiceErrorMessage(error.message) },
            { status: 500 }
        );
    }
}