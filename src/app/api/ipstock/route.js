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
const {
    usesResellerLiveStock,
    usesResellerPanelLiveStock,
    usesKurohostLiveStock,
    stockHasResellerPanelPlans,
    stockHasKurohostPlans,
    relistAutoHiddenStocksNowInStock,
} = require('@/lib/ipStockAvailability');
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

    if (dc.nexa && typeof dc.nexa === 'object') {
        slim.nexa = {
            planId: dc.nexa.planId != null ? dc.nexa.planId : null,
            poolId: dc.nexa.poolId != null ? dc.nexa.poolId : null,
            subnet: dc.nexa.subnet ? String(dc.nexa.subnet) : '',
            protocol: dc.nexa.protocol ? String(dc.nexa.protocol) : '',
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
        resellerPanelLiveStock: stock.company
            ? usesResellerPanelLiveStock(stock, companyMap[String(stock.company)])
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
function customerCatalogStore() {
    if (!global.__oceanIpStockCatalog) global.__oceanIpStockCatalog = new Map();
    return global.__oceanIpStockCatalog;
}

// GET method - fetch all IP stocks
export async function GET(request) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const fresh = searchParams.get('fresh') === '1';
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

        // Nexa rows stay hidden in the shared database so the live site does not
        // list them. Local dev still returns them so a buy can be tested here.
        const showHiddenNexaLocally = customerView && process.env.NODE_ENV !== 'production';
        if (showHiddenNexaLocally) {
            query = {
                $or: [
                    { hiddenFromStore: { $ne: true } },
                    { tags: 'nexa' },
                ],
            };
        }

        const catalogKey = customerView ? '__base' : '';
        const personalizeCatalog = async (rows) => {
            if (!customerView || !Array.isArray(rows)) return rows;
            try {
                const mod = await import('@/lib/resellerStorePricing');
                const reseller = await mod.getResellerFromRequest(request);
                if (reseller) return mod.applyResellerPricingToStocks(rows, reseller);
            } catch (priceErr) {
                console.warn('[IPSTOCK-API] reseller price skipped:', priceErr.message);
            }
            return rows;
        };
        const catalogResponse = async (rowsOrJson) => {
            const rows = typeof rowsOrJson === 'string' ? JSON.parse(rowsOrJson) : rowsOrJson;
            const payload = await personalizeCatalog(rows);
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
        if (customerView && !fresh) {
            const hit = customerCatalogStore().get(catalogKey);
            if (hit?.body && Date.now() - hit.at < 20000) {
                return catalogResponse(hit.body);
            }
            if (hit?.promise) {
                const shared = await hit.promise;
                return catalogResponse(shared);
            }
        }

        if (customerView) {
            const { isIstPeakTrafficHour } = require('@/lib/istPeakTraffic');
            // Do not hold the store or dashboard behind Nexa getPlans (20–45s).
            // During 8–11 IST skip even the background call so Node stays free.
            if (!isIstPeakTrafficHour()) {
                void (async () => {
                    try {
                        const { syncNexaStoreAvailability } = require('@/lib/nexaStoreStock');
                        const nexaChanged = await syncNexaStoreAvailability({ Company, IPStock });
                        if (nexaChanged > 0) {
                            customerCatalogStore().clear();
                        }
                    } catch (nexaStockErr) {
                        console.warn('[IPSTOCK-API] Nexa stock sync failed:', nexaStockErr.message);
                    }
                })();
            }
        }

        let resolveCatalog;
        let rejectCatalog;
        if (customerView) {
            const promise = new Promise((resolve, reject) => {
                resolveCatalog = resolve;
                rejectCatalog = reject;
            });
            customerCatalogStore().set(catalogKey, { promise, reject: rejectCatalog, at: 0, body: null });
        }

        if (customerView) {
            // Don't block the catalog read on this write. A plan that just
            // came back in stock shows on the next load instead of every
            // visitor waiting on the update.
            void relistAutoHiddenStocksNowInStock().catch((relistErr) => {
                console.warn('[IPSTOCK-API] auto-relist hidden in-stock plans failed:', relistErr.message);
            });
        }

        let ipStocks;
        if (customerView) {
            // Inventory rows hold credentials and can be huge. Load counts
            // only for company plans that actually have inventory, and never
            // send the rows themselves.
            const stocksPromise = IPStock.find(query)
                .select('-inventoryItems')
                .lean()
                .maxTimeMS(10000);
            const { isIstPeakTrafficHour: peakNow } = require('@/lib/istPeakTraffic');
            const countRowsPromise = peakNow()
                ? Promise.resolve([])
                : IPStock.aggregate([
                {
                    $match: {
                        ...query,
                        company: { $ne: null },
                        'inventoryItems.0': { $exists: true },
                    },
                },
                {
                    $project: {
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
            ]).option({ maxTimeMS: 8000 });
            const [stockRows, countRows] = await Promise.all([stocksPromise, countRowsPromise]);
            ipStocks = stockRows;
            const countById = new Map(countRows.map((row) => [String(row._id), row]));
            for (const stock of ipStocks) {
                const counts = countById.get(String(stock._id));
                if (!counts) continue;
                stock.inventoryItemCount = counts.inventoryItemCount;
                stock.inventoryAvailable = counts.inventoryAvailable;
            }
        } else {
            ipStocks = await IPStock.find(query).lean().maxTimeMS(10000);
        }
        if (showHiddenNexaLocally) {
            for (const stock of ipStocks) {
                const tags = Array.isArray(stock.tags) ? stock.tags : [];
                if (tags.includes('nexa')) stock.hiddenFromStore = false;
            }
        }
        if (!ipStocks) {
            const empty = JSON.stringify([]);
            if (customerView) {
                customerCatalogStore().set(catalogKey, { at: Date.now(), body: empty, promise: null });
                resolveCatalog(empty);
            }
            return new Response(empty, {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const withModes = await enrichIpStocksWithProviderModes(ipStocks);
        const enriched = customerView ? enrichIpStocksForStore(withModes) : withModes;
        const baseJson = JSON.stringify(enriched);
        if (customerView) {
            customerCatalogStore().set(catalogKey, { at: Date.now(), body: baseJson, promise: null });
            resolveCatalog(baseJson);
        }

        return catalogResponse(enriched);
    } catch (error) {
        console.error('[IPSTOCK-API] Error fetching IP stocks:', error.message);
        try {
            const pending = customerCatalogStore().get('__base');
            if (pending?.reject) {
                customerCatalogStore().delete('__base');
                pending.reject(error);
            }
        } catch {
            /* ignore */
        }
        return new Response(JSON.stringify({ error: 'Failed to fetch IP Stocks', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
