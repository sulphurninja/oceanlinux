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

        if (order?.trialVpsPackageId) {
            try {
                const { enrichTrialVpsPanelManageFromPackage } = require('@/lib/trialVpsManageEnrich');
                const enriched = await enrichTrialVpsPanelManageFromPackage(order);
                if (enriched.updated) order = enriched.order;
            } catch (enrichErr) {
                console.warn('[orders/:id] trial manage enrich failed:', enrichErr.message);
            }
        }

        // Return DB order immediately. Panel calls were blocking the manage page
        // for several seconds (felt like a hang).
        void (async () => {
            try {
                const { isExpiredServiceForCustomer } = require('@/lib/expiredPanelSync');
                if (isExpiredServiceForCustomer(order)) return;
                await syncSingleOrderExpiryFromPanel(order, { force: false });
                await maybeSyncResellerOrderOnFetch(order);
            } catch (syncErr) {
                console.warn('[orders/:id] background panel sync failed:', syncErr.message);
            }
        })();

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

        if (!order.companyAutomation?.enabled && order.trialManageCompanyId) {
            try {
                const { buildCompanyAutomationMetaForOrder } = require('@/lib/companyAutomationMeta');
                const company = await Company.findById(order.trialManageCompanyId)
                    .select('virtualizors virtualizor resellerApi netbayApi kurohostApi joyApi hostdzireApi name')
                    .lean();
                const meta = buildCompanyAutomationMetaForOrder(company, order);
                if (meta) {
                    order = { ...order, companyAutomation: meta };
                }
            } catch (metaErr) {
                console.warn('[orders/:id] trial company automation meta failed:', metaErr.message);
            }
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