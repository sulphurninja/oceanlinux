// pages/api/ipstock.js
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { requireAdmin } from '@/lib/adminAuth';
const { companyUsesNetbayLiveStock } = require('@/lib/companyNetbayApi');
const { companyUsesKurohostLiveStock } = require('@/lib/companyKurohostApi');
const { companyUsesResellerLiveStock } = require('@/lib/companyResellerApi');
const { companyUsesHostdzireLiveStock } = require('@/lib/companyHostdzireApi');
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
            groupTag: dc.netbay.groupTag ? String(dc.netbay.groupTag) : '',
            groupTags: Array.isArray(dc.netbay.groupTags)
                ? dc.netbay.groupTags.map((t) => String(t).trim()).filter(Boolean)
                : [],
            productType: dc.netbay.productType ? String(dc.netbay.productType) : '',
            proxyTemplate: dc.netbay.proxyTemplate ? String(dc.netbay.proxyTemplate) : '',
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

    if (dc.hostdzire && typeof dc.hostdzire === 'object') {
        const inventoryByMemory = {};
        for (const [memory, slot] of Object.entries(toPlainMap(dc.hostdzire.inventoryByMemory))) {
            if (slot?.inventoryKey) inventoryByMemory[memory] = true;
        }
        slim.hostdzire = {
            inventoryByMemory,
            variantStock: slimVariantStock(dc.hostdzire.variantStock),
        };
    }

    return slim;
}

function filterSmartVpsMemoryOptionsForStore(stock) {
  if (!stock || typeof stock !== 'object') return stock;
  const name = String(stock.name || '').trimStart();
  if (!name.startsWith('🌊')) return stock;

  const dc = toPlainMap(stock.defaultConfigurations);
  const smartvps = dc?.smartvps || {};
  const allowedRams = Array.isArray(smartvps.allowedRams) ? smartvps.allowedRams : null;
  const byMemoryKeys = smartvps.byMemory && typeof smartvps.byMemory === 'object'
    ? Object.keys(toPlainMap(smartvps.byMemory))
    : null;

  const opts = toPlainMap(stock.memoryOptions);
  const allowedKeys = allowedRams?.length
    ? allowedRams.map((gb) => `${gb}GB`)
    : byMemoryKeys?.length
      ? byMemoryKeys
      : null;

  if (!allowedKeys?.length) return stock;

  const filtered = {};
  for (const key of allowedKeys) {
    if (opts[key]) filtered[key] = opts[key];
  }
  return { ...stock, memoryOptions: filtered };
}

function enrichIpStocksForStore(ipStocks) {
    return ipStocks.map((stock) => {
        const hasInventory = usesPreconfiguredInventory(stock);
        const inventoryForStore = hasInventory && inventoryDrivesStoreAvailability(stock);
        const { inventoryItems, defaultConfigurations, promoCodes, inventoryItemCount, ...safeStock } = stock;
        const smartvpsAllowedRams = Array.isArray(defaultConfigurations?.smartvps?.allowedRams)
            ? defaultConfigurations.smartvps.allowedRams
            : [];
        // The store only renders a "Promo" badge — codes are validated server-side
        // via /api/validate-promo, so shipping the full list would just bloat the
        // payload (it was over half of it).
        const activePromoCount = Array.isArray(promoCodes)
            ? promoCodes.filter((p) => p && p.isActive !== false).length
            : 0;
        const slimDc = slimDefaultConfigurationsForStore(defaultConfigurations);
        if (smartvpsAllowedRams.length) {
            slimDc.smartvps = { allowedRams: smartvpsAllowedRams };
        }
        const filteredStock = filterSmartVpsMemoryOptionsForStore(safeStock);
        return {
            ...filteredStock,
            defaultConfigurations: slimDc,
            promoCodeCount: activePromoCount,
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
        .select('netbayApi kurohostApi hostdzireApi resellerApi')
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
        hostdzireUseLiveStockApi: stock.company
            ? companyUsesHostdzireLiveStock(companyMap[String(stock.company)])
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

        let ipStocks;
        if (customerView) {
            ipStocks = await IPStock.aggregate([
                { $match: query },
                {
                    $addFields: {
                        inventoryItemCount: { $size: { $ifNull: ['$inventoryItems', []] } },
                        inventoryAvailable: {
                            $size: {
                                $filter: {
                                    input: { $ifNull: ['$inventoryItems', []] },
                                    as: 'item',
                                    cond: { $ne: ['$$item.allocated', true] },
                                },
                            },
                        },
                    },
                },
                {
                    $project: {
                        name: 1,
                        description: 1,
                        available: 1,
                        hiddenFromStore: 1,
                        stockCount: 1,
                        availabilityManual: 1,
                        company: 1,
                        serverType: 1,
                        tags: 1,
                        memoryOptions: 1,
                        promoCodes: 1,
                        defaultConfigurations: 1,
                        inventoryItemCount: 1,
                        inventoryAvailable: 1,
                    },
                },
            ]).option({ maxTimeMS: 10000 });
        } else {
            ipStocks = await IPStock.find(query).lean().maxTimeMS(10000);
        }
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

        let payload = enriched;
        if (customerView) {
            const { getResellerFromRequest, applyResellerPricingToStocks } = await import('@/lib/resellerStorePricing');
            const reseller = await getResellerFromRequest(request);
            if (reseller) payload = applyResellerPricingToStocks(enriched, reseller);
        }

        const jsonResponse = JSON.stringify(payload);
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
