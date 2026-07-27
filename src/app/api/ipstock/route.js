// pages/api/ipstock.js
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { requireAdmin } from '@/lib/adminAuth';
const { companyUsesNetbayLiveStock } = require('@/lib/companyNetbayApi');
const { companyUsesKurohostLiveStock } = require('@/lib/companyKurohostApi');
const { companyUsesResellerLiveStock } = require('@/lib/companyResellerApi');
const { usesResellerLiveStock, usesKurohostLiveStock, stockHasResellerPanelPlans, stockHasKurohostPlans } = require('@/lib/ipStockAvailability');
const { syncResellerIpStockRow } = require('@/lib/resellerLiveStock');
const { syncKurohostIpStockRow } = require('@/lib/kurohostLiveStock');
const { getCompanyFulfillmentMode, countUnallocatedInventory, usesPreconfiguredInventory, inventoryDrivesStoreAvailability } = require('@/lib/companyInventory');

function toPlainMap(value) {
    if (!value) return {};
    if (value instanceof Map) return Object.fromEntries(value);
    return typeof value === 'object' ? value : {};
}

function slimVariantStock(variantStock) {
    const raw = toPlainMap(variantStock);
    const out = {};
    for (const [memory, row] of Object.entries(raw)) {
        if (!memory || String(memory).startsWith('$') || !row || typeof row !== 'object') continue;
        out[memory] = {
            available: row.available,
            skipped: row.skipped,
        };
    }
    return out;
}

/** Customer dashboard only needs stock flags — not full ADVPS/reseller catalog blobs. */
function slimDefaultConfigurationsForStore(defaultConfigurations) {
    const dc = toPlainMap(defaultConfigurations);
    const slim = {};

    if (dc.netbay && typeof dc.netbay === 'object') {
        const planByMemory = {};
        for (const [memory, planId] of Object.entries(toPlainMap(dc.netbay.planByMemory))) {
            if (planId) planByMemory[memory] = true;
        }
        slim.netbay = {
            planByMemory,
            variantStock: slimVariantStock(dc.netbay.variantStock),
        };
    }

    if (dc.kurohost && typeof dc.kurohost === 'object') {
        const flavorByMemory = {};
        for (const [memory, flavorId] of Object.entries(toPlainMap(dc.kurohost.flavorByMemory))) {
            if (flavorId) flavorByMemory[memory] = true;
        }
        slim.kurohost = {
            cloudZoneId: !!dc.kurohost.cloudZoneId,
            zoneIds: Array.isArray(dc.kurohost.zoneIds) ? dc.kurohost.zoneIds.map(String) : [],
            flavorByMemory,
            variantStock: slimVariantStock(dc.kurohost.variantStock),
        };
    }

    if (dc.resellerApi && typeof dc.resellerApi === 'object') {
        slim.resellerApi = {
            variantStock: slimVariantStock(dc.resellerApi.variantStock),
        };
    }

    return slim;
}

function enrichIpStocksForStore(ipStocks) {
    return ipStocks.map((stock) => {
        const hasInventory = usesPreconfiguredInventory(stock);
        const inventoryForStore = hasInventory && inventoryDrivesStoreAvailability(stock);
        const { inventoryItems, defaultConfigurations, ...safeStock } = stock;
        return {
            ...safeStock,
            defaultConfigurations: slimDefaultConfigurationsForStore(defaultConfigurations),
            usesPreconfiguredInventory: inventoryForStore,
            inventoryAvailable: inventoryForStore ? countUnallocatedInventory(stock) : undefined,
        };
    });
}

async function enrichIpStocksWithProviderModes(ipStocks) {
    const companyIds = [...new Set(
        ipStocks.filter((s) => s.company).map((s) => String(s.company))
    )];
    if (!companyIds.length) return ipStocks;

    const companies = await Company.find({ _id: { $in: companyIds } })
        .select('netbayApi kurohostApi resellerApi')
        .lean();
    const companyMap = Object.fromEntries(companies.map((c) => [String(c._id), c]));

    return ipStocks.map((stock) => ({
        ...stock,
        fulfillmentMode: stock.company ? getCompanyFulfillmentMode(stock) : null,
        kurohostUseLiveStockApi: stock.company
            ? companyUsesKurohostLiveStock(companyMap[String(stock.company)])
            : null,
        netbayUseLiveStockApi: stock.company
            ? companyUsesNetbayLiveStock(companyMap[String(stock.company)])
            : null,
        resellerUseLiveStockApi: stock.company
            ? companyUsesResellerLiveStock(companyMap[String(stock.company)])
            : null,
    }));
}

export async function POST(request) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    try {
        const reqBody = await request.json();
        const { name, available, serverType, tags, memoryOptions, promoCodes, defaultConfigurations, company, stockCount, hiddenFromStore } = reqBody;

        const linkedCompany = company && company !== 'none' ? company : null;
        const count = linkedCompany ? Math.max(0, Math.floor(Number(stockCount) || 0)) : undefined;

        let companyDoc = null;
        if (linkedCompany) {
            companyDoc = await Company.findById(linkedCompany).select('netbayApi resellerApi').lean();
        }

        const submitTags = tags || [];
        const hasResellerPlans = !!(
            defaultConfigurations?.resellerApi ||
            submitTags.map((t) => String(t).toLowerCase()).some((t) =>
                t === 'reseller-api' || t === 'primevps' || t === 'primevm'
            )
        );
        const resellerLiveStock =
            linkedCompany &&
            hasResellerPlans &&
            usesResellerLiveStock(
                { company: linkedCompany, tags: submitTags, defaultConfigurations },
                companyDoc
            );

        const newIPStock = new IPStock({
            name,
            available: resellerLiveStock
                ? true
                : linkedCompany
                ? (count > 0)
                : available,
            stockCount: resellerLiveStock
                ? 1
                : linkedCompany
                ? count
                : 0,
            hiddenFromStore: !!hiddenFromStore,
            serverType,
            tags: submitTags,
            memoryOptions,
            promoCodes: promoCodes || [],
            defaultConfigurations: defaultConfigurations || {},
            company: linkedCompany,
        });

        await newIPStock.save();

        let responseStock = newIPStock;
        if (resellerLiveStock && hasResellerPlans) {
            try {
                responseStock = await syncResellerIpStockRow(newIPStock, { force: true }) || newIPStock;
            } catch (syncErr) {
                console.warn('[IPSTOCK-CREATE] reseller live sync failed:', syncErr.message);
            }
        }

        return new Response(JSON.stringify(responseStock), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error parsing JSON or saving to DB:', error);
        return new Response(JSON.stringify({ error: 'Failed to create IP Stock', details: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
// GET method - fetch all IP stocks
export async function GET(request) {
    console.log('[IPSTOCK-API] GET request received');

    try {
        await connectDB();
        console.log('[IPSTOCK-API] Database connected');

        const { searchParams } = new URL(request.url);
        const includeHidden =
            searchParams.get('includeHidden') === '1' ||
            searchParams.get('includeHidden') === 'true';

        let query = { hiddenFromStore: { $ne: true } };
        let customerView = true;
        if (includeHidden) {
            const admin = await requireAdmin(request);
            if (admin) {
                query = {};
                customerView = false;
            }
        }

        let dbQuery = IPStock.find(query).lean().maxTimeMS(10000);
        if (customerView) {
            dbQuery = dbQuery.select(
                'name description available hiddenFromStore stockCount availabilityManual company serverType tags memoryOptions promoCodes defaultConfigurations inventoryItems.allocated'
            );
        }
        const ipStocks = await dbQuery;
        console.log(`[IPSTOCK-API] Found ${ipStocks?.length || 0} IP stocks`);

        if (!ipStocks) {
            console.log('[IPSTOCK-API] No IP stocks found (null result)');
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const enriched = customerView
            ? enrichIpStocksForStore(await enrichIpStocksWithProviderModes(ipStocks))
            : await enrichIpStocksWithProviderModes(ipStocks);
        const jsonResponse = JSON.stringify(enriched);
        console.log(`[IPSTOCK-API] Response size: ${jsonResponse.length} bytes`);

        return new Response(jsonResponse, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
    } catch (error) {
        console.error('[IPSTOCK-API] Error fetching IP stocks:', error.message);
        console.error('[IPSTOCK-API] Error stack:', error.stack);
        return new Response(JSON.stringify({ error: 'Failed to fetch IP Stocks', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
