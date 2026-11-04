import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { resolveOrderForUserOrAdmin } from '@/lib/resolveOrderAccess';
const { maybeSyncResellerOrderOnFetch } = require('@/lib/resellerApiOrderSync');
const { syncSingleOrderExpiryFromPanel } = require('@/lib/companyResellerInventorySync');
const { sanitizeOrderForCustomer } = require('@/lib/customerFacingErrors');
const Company = require('@/models/companyModel');
const IPStock = require('@/models/ipStockModel');
const { resolveJoyApiForOrder } = require('@/lib/companyJoyApi');
const { attachManageCompanyAutomation } = require('@/lib/orderManageCompany');

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

        const joyMatch = await resolveJoyApiForOrder(order, { Company, IPStock, skipIpProbe: true });
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

        if (!order.companyAutomation?.enabled) {
            try {
                order = await attachManageCompanyAutomation(order);
            } catch (metaErr) {
                console.warn('[orders/:id] manage company automation meta failed:', metaErr.message);
            }
        }

        const { attachProviderCompanyNames } = require('@/lib/attachProviderCompanyName');
        const [named] = await attachProviderCompanyNames([order]);

        return NextResponse.json(sanitizeOrderForCustomer(named || order, { isAdmin: resolved.isAdmin }));
    } catch (error) {
        console.error('Error fetching order:', error);
        const { customerServiceErrorMessage } = require('@/lib/customerFacingErrors');
        return NextResponse.json(
            { message: customerServiceErrorMessage(error.message) },
            { status: 500 }
        );
    }
}