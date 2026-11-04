import { NextResponse } from 'next/server';
import { resolveCompanySession } from '@/lib/companySession';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { getIpStockRemaining, setIpStockCount, usesStockCount, usesResellerPanelLiveStock } from '@/lib/ipStockAvailability';
import {
  usesPreconfiguredInventory,
  usesCompanyInventoryFulfillment,
  getCompanyFulfillmentMode,
  setCompanyFulfillmentMode,
  mergeCompanyConfig,
  readCompanyConfig,
  countUnallocatedInventory,
  parseInventoryBulkLines,
  syncStockCountFromInventory,
  normalizeOsForServerType,
  resolveUsernameForOs,
  reconcileCompanyInventoryOrderIps,
  reconcileCompanyInventoryAllocationsForStocks,
  reconcileCompanyInventoryToManualUnits,
  syncManualUnitsAfterInventoryChange,
  pruneCompanyInventoryItems,
  manualReleaseCompanyInventoryItem,
  appendOrMergeInventoryItems,
  cleanInventoryIp,
  looksLikeIpv4,
} from '@/lib/companyInventory';
import Order from '@/models/orderModel';
import { COMPANY_FILTER_VERSION } from '@/lib/companyOrders';
import { buildCompanyValidityMismatchReport } from '@/lib/companyValidityMismatch';

export const maxDuration = 120;

const {
  hasCompanyResellerApi,
  getCompanyResellerApiConfig,
  companyUsesResellerLiveStock,
  companyHasPortalBulkPromos,
  companyHasPortalInventoryFullAccess,
} = require('@/lib/companyResellerApi');
const {
  applyResellerZonesToStockDocument,
  serializeResellerZonesForClient,
  sanitizeZoneIdsAgainstPanel,
} = require('@/lib/resellerZoneConfig');
const { syncResellerIpStockRow, stockHasResellerPanelPlans } = require('@/lib/resellerLiveStock');
const { readResellerApiStockConfig } = require('@/lib/resellerApiStockConfig');
const ResellerApi = require('@/services/resellerApi');
const {
  fetchResellerCredentialsByIp,
  syncAllInventoryExpiriesFromReseller,
} = require('@/lib/companyResellerInventorySync');
const { auditCompanyVpsReconciliation } = require('@/lib/hostheavenVmAudit');

function serializeInventoryItem(item) {
  return {
    _id: String(item._id),
    ipAddress: item.ipAddress,
    username: item.username,
    password: item.allocated ? '********' : item.password,
    os: item.os,
    expiryDate: item.expiryDate || null,
    addedAt: item.addedAt || null,
    allocated: !!item.allocated,
    orderId: item.orderId ? String(item.orderId) : null,
    allocatedAt: item.allocatedAt || null,
  };
}

function readLiveStockSummary(stock, companyDoc) {
  const liveEnabled = usesResellerPanelLiveStock(stock, companyDoc) && stockHasResellerPanelPlans(stock);
  if (!liveEnabled) return { enabled: false };

  let cfg = stock?.defaultConfigurations?.resellerApi;
  if (!cfg && typeof stock?.defaultConfigurations?.get === 'function') {
    cfg = stock.defaultConfigurations.get('resellerApi');
  }
  const variantStock = cfg?.variantStock && typeof cfg.variantStock === 'object' ? cfg.variantStock : {};
  const primary = Object.values(variantStock).find(
    (v) => v && typeof v === 'object' && !v.mirroredFrom
  ) || Object.values(variantStock)[0] || null;

  const {
    readResellerApiStockConfig,
    stockNameRequiresMappedZone,
    regionResellerPlanMustHideFromStore,
  } = require('@/lib/resellerApiStockConfig');
  const stockCfg = readResellerApiStockConfig(stock);
  const zoneMapped =
    (Array.isArray(stockCfg.zoneIds) && stockCfg.zoneIds.length > 0) ||
    (stockCfg.zoneId != null && Number.isFinite(Number(stockCfg.zoneId)));

  const regionBlocked = regionResellerPlanMustHideFromStore({
    ...stock,
    inventoryAvailable: countUnallocatedInventory(stock),
  });

  const savedUnits = countUnallocatedInventory(stock);
  let zoneLive = false;
  if (savedUnits > 0) {
    zoneLive = true;
  } else if (stock.availabilityManual === true && Math.max(0, Number(stock.stockCount) || 0) > 0) {
    zoneLive = false;
  } else if (regionBlocked) {
    zoneLive = false;
  } else if (stockNameRequiresMappedZone(stock) && !zoneMapped) {
    zoneLive = false;
  } else if (zoneMapped) {
    zoneLive =
      primary?.zoneOk === true ||
      (primary?.stockMode === 'zone' && primary?.available === true);
  } else {
    zoneLive = primary?.available === true && primary?.stockMode !== 'wallet'
      ? true
      : primary?.available === true && !stockNameRequiresMappedZone(stock);
  }

  return {
    enabled: true,
    manualOverride: stock.availabilityManual === true,
    zoneLive,
    zoneMapped,
    regionBlocked,
    zoneName: primary?.zoneName || cfg?.zoneName || null,
    zoneStatus: primary?.zoneStatus || null,
    message: regionBlocked
      ? 'Map panel zone on this plan — wallet is not this IP region'
      : primary?.message || primary?.reason || null,
    lastSync: cfg?.lastStockSync || null,
  };
}

function serializePromoCodes(promoCodes) {
  return (Array.isArray(promoCodes) ? promoCodes : []).map((p) => ({
    code: String(p.code || '').trim().toUpperCase(),
    discount: Number(p.discount) || 0,
    discountType: p.discountType === 'percentage' ? 'percentage' : 'fixed',
    isActive: p.isActive !== false,
  }));
}

function normalizePromoEntries(rawPromos, legacyPromo) {
  const list = Array.isArray(rawPromos) ? rawPromos : legacyPromo ? [legacyPromo] : [];
  const out = [];
  const seen = new Set();

  for (const item of list) {
    const code = String(item?.code || '').trim().toUpperCase();
    if (!code) continue;
    if (seen.has(code)) continue;

    const discount = Number(item?.discount);
    if (!Number.isFinite(discount) || discount < 0) continue;

    const discountType = item?.discountType === 'percentage' ? 'percentage' : 'fixed';
    if (discountType === 'percentage' && discount > 100) continue;

    seen.add(code);
    out.push({
      code,
      discount,
      discountType,
      isActive: item?.isActive !== false,
      createdAt: new Date(),
    });
  }

  return out;
}

function replacePromosOnStock(stock, promoEntries) {
  if (!Array.isArray(promoEntries) || promoEntries.length === 0) return false;
  stock.promoCodes = promoEntries.map((entry) => ({ ...entry }));
  return true;
}

function serializeStock(stock, companyDoc) {
  const hasInventory = usesPreconfiguredInventory(stock);
  const fulfillmentMode = getCompanyFulfillmentMode(stock);
  const liveStock = readLiveStockSummary(stock, companyDoc);
  return {
    _id: String(stock._id),
    name: stock.name,
    available: !!stock.available,
    stockCount: getIpStockRemaining(stock, companyDoc),
    usesStockCount: usesStockCount(stock, companyDoc),
    fulfillmentMode,
    liveStock,
    usesPreconfiguredInventory: hasInventory,
    inventoryTotal: stock.inventoryItems?.length || 0,
    inventoryAvailable: hasInventory ? countUnallocatedInventory(stock) : 0,
    inventoryItems: hasInventory ? (stock.inventoryItems || []).map(serializeInventoryItem) : [],
    serverType: stock.serverType,
    tags: stock.tags || [],
    promoCodes: serializePromoCodes(stock.promoCodes),
    resellerZones: serializeResellerZonesForClient(stock),
  };
}

export async function GET() {
  const company = await resolveCompanySession();
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'X-Deploy-Version': COMPANY_FILTER_VERSION } });
  }

  try {
    await connectDB();
    const companyDoc = await Company.findOne({ slug: company.slug, isActive: true })
      .select('resellerApi netbayApi name slug portalInventoryFullAccess')
      .lean();
    if (!companyDoc) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers: { 'X-Deploy-Version': COMPANY_FILTER_VERSION } });
    }

    let stocks = await IPStock.find({ company: companyDoc._id }).sort({ name: 1 });
    const stockIds = stocks.map((s) => s._id);
    const companyOrders = stockIds.length
      ? await Order.find({
          ipStockId: { $in: stockIds },
          status: { $in: ['active', 'confirmed', 'paid', 'completed'] },
        })
          .select('_id ipStockId ipAddress status inventoryItemId')
          .lean()
      : [];
    const inventoryFullAccess = companyHasPortalInventoryFullAccess(companyDoc);
    await reconcileCompanyInventoryAllocationsForStocks(stocks, companyOrders, {
      capFreeToManualUnits: inventoryFullAccess,
    });
    stocks = await IPStock.find({ company: companyDoc._id }).sort({ name: 1 }).lean();

    const resellerCfg = getCompanyResellerApiConfig(companyDoc);
    const hasResellerSync = !!resellerCfg;
    const hasLiveStockSync = companyUsesResellerLiveStock(companyDoc);
    const hasPortalBulkPromos = companyHasPortalBulkPromos(companyDoc);

    return NextResponse.json({
      stocks: stocks.map((s) => serializeStock(s, companyDoc)),
      hasResellerSync,
      hasPortalBulkPromos,
      hasLiveStockSync,
      hasInventoryFullAccess: companyHasPortalInventoryFullAccess(companyDoc),
      resellerLabel: resellerCfg?.label || 'Hostheaven',
    }, {
      headers: { 'X-Deploy-Version': COMPANY_FILTER_VERSION },
    });
  } catch (err) {
    console.error('[company/stocks GET]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to load stocks' },
      { status: 500, headers: { 'X-Deploy-Version': COMPANY_FILTER_VERSION } }
    );
  }
}

export async function PUT(request) {
  const company = await resolveCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const body = await request.json();
  const { stockId, stockCount, action, items, bulkLines, removeItemId, ipAddress, addToInventory, fulfillmentMode, zoneIds, stockIds, promo, promos } = body;

  if (action === 'syncAllResellerExpiries') {
    const companyDoc = await Company.findById(company.id)
      .select('resellerApi netbayApi name slug portalInventoryFullAccess')
      .lean();
    if (!hasCompanyResellerApi(companyDoc)) {
      return NextResponse.json(
        { error: 'Hostheaven sync is not enabled. Ask admin to enable Reseller API on your company.' },
        { status: 403 }
      );
    }

    const stocks = await IPStock.find({ company: company.id });
    const { updated, failed, panelExpiriesByIp, ordersUpdated, ordersFailed } =
      await syncAllInventoryExpiriesFromReseller(companyDoc, stocks);

    const stockIds = stocks.map((s) => s._id);
    const orders = stockIds.length
      ? await Order.find({
          ipStockId: { $in: stockIds },
          status: { $nin: ['cancelled', 'failed'] },
        })
          .select('_id expiryDate createdAt ipStockId ipAddress inventoryItemId')
          .lean()
      : [];

    const liveOrders = orders.filter((o) =>
      ['active', 'confirmed', 'paid', 'completed'].includes(String(o.status || '').toLowerCase())
    );
    await reconcileCompanyInventoryAllocationsForStocks(stocks, liveOrders, {
      capFreeToManualUnits: companyHasPortalInventoryFullAccess(companyDoc),
    });
    const inventoryIpHeal = await reconcileCompanyInventoryOrderIps(stocks, orders);

    const serializedStocks = stocks.map((s) => serializeStock(s.toObject?.() || s, companyDoc));
    const mismatches = buildCompanyValidityMismatchReport(
      serializedStocks,
      orders,
      new Date(),
      panelExpiriesByIp,
      failed.map((f) => f.ipAddress)
    );

    return NextResponse.json({
      success: true,
      message: `Synced expiry for ${updated.length} inventory VPS + ${ordersUpdated?.length || 0} customer orders`,
      updatedCount: updated.length,
      ordersUpdatedCount: ordersUpdated?.length || 0,
      failedCount: failed.length,
      ordersFailedCount: ordersFailed?.length || 0,
      updated,
      ordersUpdated: ordersUpdated || [],
      failed,
      ordersFailed: ordersFailed || [],
      mismatches,
      mismatchCount: mismatches.length,
      mismatchIps: mismatches.map((m) => m.ipAddress),
      panelExpiriesByIp,
      stocks: serializedStocks,
    });
  }

  if (action === 'auditVpsReconciliation') {
    const companyDoc = await Company.findById(company.id).select('resellerApi netbayApi name').lean();
    if (!hasCompanyResellerApi(companyDoc)) {
      return NextResponse.json(
        { error: 'Hostheaven sync is not enabled. Ask admin to enable Reseller API on your company.' },
        { status: 403 }
      );
    }

    const report = await auditCompanyVpsReconciliation(companyDoc);
    return NextResponse.json({ success: true, ...report });
  }

  if (action === 'bulkApplyPromo') {
    const companyDoc = await Company.findById(company.id).select('resellerApi netbayApi name').lean();
    if (!companyHasPortalBulkPromos(companyDoc)) {
      return NextResponse.json(
        { error: 'Bulk promos are not enabled for your company portal.' },
        { status: 403 }
      );
    }
    if (!Array.isArray(stockIds) || stockIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one IP stock' }, { status: 400 });
    }

    const entries = normalizePromoEntries(promos, promo);
    if (!entries.length) {
      return NextResponse.json({ error: 'Add at least one valid promo (code + discount)' }, { status: 400 });
    }

    const stocks = await IPStock.find({ _id: { $in: stockIds }, company: company.id });
    if (!stocks.length) {
      return NextResponse.json({ error: 'No matching stocks found for your company' }, { status: 404 });
    }

    let updatedCount = 0;
    for (const stock of stocks) {
      if (!replacePromosOnStock(stock, entries)) continue;
      await stock.save();
      updatedCount += 1;
    }

    const fresh = await IPStock.find({ _id: { $in: stocks.map((s) => s._id) } }).lean();
    const codesLabel = entries.map((e) => e.code).join(', ');
    return NextResponse.json({
      success: true,
      message: `${entries.length} promo(s) [${codesLabel}] applied to ${updatedCount} IP stock(s)`,
      updatedCount,
      promoCount: entries.length,
      stocks: fresh.map((s) => serializeStock(s, companyDoc)),
    });
  }

  if (action === 'syncLiveStock') {
    const companyDoc = await Company.findOne({ slug: company.slug, isActive: true })
      .select('resellerApi netbayApi name slug')
      .lean();
    if (!companyDoc) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const stocks = await IPStock.find({ company: companyDoc._id });
    const canSyncLive =
      companyUsesResellerLiveStock(companyDoc) ||
      stocks.some((s) => usesResellerPanelLiveStock(s, companyDoc));
    if (!canSyncLive) {
      return NextResponse.json(
        { error: 'Live stock sync is off. Admin → Companies → PrimeVPS → Reseller API → Live stock ON karo, ya IP stock par panel region set karo.' },
        { status: 403 }
      );
    }

    for (const stock of stocks) {
      if (stock.availabilityManual) continue;
      const companyCfg = readCompanyConfig(stock);
      if (companyCfg.fulfillmentMode === 'units') {
        const nextCfg = { ...companyCfg };
        delete nextCfg.fulfillmentMode;
        stock.defaultConfigurations.set('company', nextCfg);
        stock.markModified('defaultConfigurations');
        await stock.save();
      }
    }

    let zonesList = null;
    try {
      const firstReseller = stocks.find((s) => stockHasResellerPanelPlans(s));
      if (firstReseller) {
        const ctx = await (async () => {
          const { syncResellerIpStockRow, stockHasResellerPanelPlans } = require('@/lib/resellerLiveStock');
const ResellerApi = require('@/services/resellerApi');
          const cfg = getCompanyResellerApiConfig(companyDoc);
          return cfg ? new ResellerApi(cfg) : null;
        })();
        if (ctx) zonesList = await ctx.listZones();
      }
    } catch (err) {
      console.warn('[company/stocks syncLiveStock] listZones failed:', err.message);
    }

    let synced = 0;
    let inStock = 0;
    let skippedManual = 0;
    const failed = [];

    for (const stock of stocks) {
      if (!stockHasResellerPanelPlans(stock)) continue;
      const stockCfg = readResellerApiStockConfig(stock);
      const isZoneLiveStock =
        (stockCfg.zoneId != null || (stockCfg.zoneIds?.length ?? 0) > 0);
      if (stock.availabilityManual && !isZoneLiveStock) {
        skippedManual += 1;
        continue;
      }
      try {
        const updated = await syncResellerIpStockRow(stock, { force: true, zonesList });
        synced += 1;
        if (updated?.available) inStock += 1;
      } catch (err) {
        failed.push({ stockId: String(stock._id), name: stock.name, error: err.message || 'Sync failed' });
      }
    }

    const fresh = await IPStock.find({ company: companyDoc._id }).sort({ name: 1 }).lean();
    return NextResponse.json({
      success: true,
      synced,
      inStock,
      skippedManual,
      failed,
      stocks: fresh.map((s) => serializeStock(s, companyDoc)),
    });
  }

  if (!stockId) {
    return NextResponse.json({ error: 'stockId is required' }, { status: 400 });
  }

  const stock = await IPStock.findOne({ _id: stockId, company: company.id });
  if (!stock) return NextResponse.json({ error: 'Stock not found or not yours' }, { status: 404 });

  const companyDoc = await Company.findById(company.id)
    .select('netbayApi resellerApi name slug portalInventoryFullAccess')
    .lean();
  const inventoryFullAccess = companyHasPortalInventoryFullAccess(companyDoc);

  if (action === 'setResellerZones') {
    if (!hasCompanyResellerApi(companyDoc)) {
      return NextResponse.json(
        { error: 'Reseller API is not enabled for your company.' },
        { status: 403 }
      );
    }

    const ids = Array.isArray(zoneIds)
      ? zoneIds.map(Number).filter((n) => Number.isFinite(n))
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: 'Select at least one panel region' }, { status: 400 });
    }

    let zonesList = [];
    try {
      const api = new ResellerApi(getCompanyResellerApiConfig(companyDoc));
      zonesList = await api.listZones();
    } catch (err) {
      return NextResponse.json(
        { error: err.message || 'Failed to load panel regions' },
        { status: 502 }
      );
    }

    const panelZones = zonesList.map((z) => ({
      id: z.id,
      name: z.name,
      status: z.status,
      live: ResellerApi.isZoneStatusLive(z.status),
    }));

    const { zoneIds: cleanIds, removed: removedStaleZoneIds } = sanitizeZoneIdsAgainstPanel(
      ids,
      zonesList
    );
    if (!cleanIds.length) {
      return NextResponse.json(
        {
          error:
            'Koi valid region nahi bacha. Sirf panel list wale regions select karo (purane ID auto hata diye gaye).',
          removedStaleZoneIds,
        },
        { status: 400 }
      );
    }

    applyResellerZonesToStockDocument(stock, cleanIds, panelZones);
    await stock.save();

    if (stockHasResellerPanelPlans(stock)) {
      try {
        await syncResellerIpStockRow(stock, { force: true, zonesList });
      } catch (syncErr) {
        console.warn('[company/stocks setResellerZones] live sync failed:', syncErr.message);
      }
    }

    const fresh = await IPStock.findById(stockId).lean();
    return NextResponse.json({
      success: true,
      message: 'Panel regions saved for this IP stock',
      removedStaleZoneIds,
      stock: serializeStock(fresh, companyDoc),
    });
  }

  if (action === 'setFulfillmentMode') {
    if (fulfillmentMode !== 'units' && fulfillmentMode !== 'inventory') {
      return NextResponse.json(
        { error: 'fulfillmentMode must be "units" or "inventory"' },
        { status: 400 }
      );
    }
    try {
      const updated = await setCompanyFulfillmentMode(stockId, fulfillmentMode);
      if (!updated) {
        return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
      }
      const fresh = await IPStock.findById(stockId).lean();
      return NextResponse.json({
        success: true,
        fulfillmentMode,
        stock: serializeStock(fresh, companyDoc),
      });
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Failed to set fulfillment mode' }, { status: 400 });
    }
  }

  // Manual unit stock — blocked for live zone plans (panel controls in/out of stock).
  if (action === 'setStockCount' || (stockCount !== undefined && !action)) {
    if (usesResellerPanelLiveStock(stock, companyDoc) && stockHasResellerPanelPlans(stock)) {
      const stockCfg = readResellerApiStockConfig(stock);
      if (stockCfg.zoneId != null || (stockCfg.zoneIds?.length ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              'Live zone stock is controlled by panel region status. Use "Sync live stock" — do not set manual units.',
          },
          { status: 400 }
        );
      }
    }

    const count = Math.max(0, Math.floor(Number(stockCount) || 0));
    const companyCfg = mergeCompanyConfig(stock, { fulfillmentMode: 'units' });
    stock.defaultConfigurations.set('company', companyCfg);
    stock.stockCount = count;
    stock.available = count > 0;
    stock.availabilityManual = true;
    if (count > 0 && stock.autoHiddenFromStore) {
      stock.hiddenFromStore = false;
      stock.autoHiddenFromStore = false;
    }
    stock.markModified('defaultConfigurations');
    await stock.save();
    if (inventoryFullAccess) {
      const freshUnits = await IPStock.findById(stockId);
      if (freshUnits) {
        await reconcileCompanyInventoryToManualUnits(freshUnits, { portalFullAccess: true });
      }
    }
    const updated = await IPStock.findById(stockId).lean();
    return NextResponse.json({ success: true, stock: serializeStock(updated, companyDoc) });
  }

  if (action === 'syncResellerCredentials') {
    if (!hasCompanyResellerApi(companyDoc)) {
      return NextResponse.json(
        { error: 'Hostheaven sync is not enabled. Ask admin to enable Reseller API on your company.' },
        { status: 403 }
      );
    }

    let credentials;
    try {
      credentials = await fetchResellerCredentialsByIp(companyDoc, ipAddress, stock.serverType);
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 400 });
    }

    if (addToInventory) {
      const mergeResult = await appendOrMergeInventoryItems(
        stock,
        [
          {
            ipAddress: credentials.ipAddress,
            username: credentials.username,
            password: credentials.password,
            os: credentials.os,
            expiryDate: credentials.expiryDate || null,
            addedAt: new Date(),
            allocated: false,
            orderId: null,
            allocatedAt: null,
          },
        ],
        { mergeDuplicateIp: inventoryFullAccess }
      );
      if (mergeResult.error) {
        return NextResponse.json({ error: mergeResult.error }, { status: 400 });
      }
      const synced = await syncStockCountFromInventory(stockId);
      return NextResponse.json({
        success: true,
        added: mergeResult.added > 0,
        merged: mergeResult.updated > 0,
        credentials: {
          ipAddress: credentials.ipAddress,
          username: credentials.username,
          os: credentials.os,
          serverName: credentials.serverName,
          expiryDate: credentials.expiryDate || null,
        },
        stock: serializeStock(synced.toObject?.() || synced, companyDoc),
      });
    }

    return NextResponse.json({
      success: true,
      credentials,
    });
  }

  if (action === 'addInventory') {
    const newItems = [];

    if (bulkLines) {
      const { items: parsed, errors } = parseInventoryBulkLines(bulkLines, stock.serverType);
      if (parsed.length === 0) {
        return NextResponse.json(
          { error: 'No valid lines. Format: ip,username,password,OS (one per line)', errors },
          { status: 400 }
        );
      }
      newItems.push(...parsed);
    }

    if (Array.isArray(items)) {
      for (const row of items) {
        if (!row?.ipAddress || !row?.password) continue;
        const ip = String(row.ipAddress).trim();
        const pass = String(row.password).trim();
        if (!looksLikeIpv4(ip)) {
          return NextResponse.json({ error: `Invalid IP address: ${ip}` }, { status: 400 });
        }
        if (looksLikeIpv4(pass)) {
          return NextResponse.json(
            { error: 'Password looks like an IP address — check ip, username, password columns' },
            { status: 400 }
          );
        }
        const os = normalizeOsForServerType(row.os, stock.serverType);
        newItems.push({
          ipAddress: ip,
          username: resolveUsernameForOs(row.username, os),
          password: pass,
          os,
          expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
          addedAt: new Date(),
          allocated: false,
          orderId: null,
          allocatedAt: null,
        });
      }
    }

    if (newItems.length === 0) {
      return NextResponse.json({ error: 'Provide items[] or bulkLines' }, { status: 400 });
    }

    const mergeResult = await appendOrMergeInventoryItems(stock, newItems, {
      mergeDuplicateIp: inventoryFullAccess,
    });
    if (mergeResult.error) {
      return NextResponse.json({ error: mergeResult.error }, { status: 400 });
    }
    if (inventoryFullAccess && (mergeResult.added > 0 || mergeResult.updated > 0)) {
      await syncManualUnitsAfterInventoryChange(stockId);
    }
    let synced = await syncStockCountFromInventory(stockId);
    if (inventoryFullAccess) {
      const freshStock = await IPStock.findById(stockId);
      if (freshStock) {
        await reconcileCompanyInventoryToManualUnits(freshStock, { portalFullAccess: true });
        synced = await IPStock.findById(stockId);
      }
    }
    return NextResponse.json({
      success: true,
      added: mergeResult.added,
      merged: mergeResult.updated,
      stock: serializeStock(synced.toObject?.() || synced, companyDoc),
    });
  }

  if (action === 'releaseInventoryAllocation') {
    if (!removeItemId) {
      return NextResponse.json({ error: 'removeItemId (inventory row id) is required' }, { status: 400 });
    }
    try {
      const { released, stock: fresh } = await manualReleaseCompanyInventoryItem(stockId, removeItemId);
      return NextResponse.json({
        success: true,
        released,
        stock: serializeStock(fresh.toObject?.() || fresh, companyDoc),
      });
    } catch (err) {
      return NextResponse.json({ error: err.message || 'Failed to release inventory row' }, { status: 400 });
    }
  }

  if (action === 'removeInventory') {
    if (!removeItemId) {
      return NextResponse.json({ error: 'removeItemId is required' }, { status: 400 });
    }
    const before = stock.inventoryItems?.length || 0;
    stock.inventoryItems = (stock.inventoryItems || []).filter((item) => {
      if (String(item._id) !== String(removeItemId)) return true;
      return !inventoryFullAccess && item.allocated;
    });
    const removed = before - (stock.inventoryItems?.length || 0);
    if (removed === 0) {
      return NextResponse.json(
        { error: inventoryFullAccess ? 'Item not found' : 'Item not found or already sold' },
        { status: 400 }
      );
    }
    await stock.save();
    if (inventoryFullAccess) {
      await syncManualUnitsAfterInventoryChange(stockId);
    }
    const synced = await syncStockCountFromInventory(stockId);
    return NextResponse.json({ success: true, removed, stock: serializeStock(synced.toObject?.() || synced, companyDoc) });
  }

  return NextResponse.json(
    { error: 'Unknown action. Use setStockCount, setFulfillmentMode, setResellerZones, bulkApplyPromo, addInventory, removeInventory, syncResellerCredentials, syncAllResellerExpiries, or auditVpsReconciliation' },
    { status: 400 }
  );
}

export async function POST(request) {
  return PUT(request);
}
