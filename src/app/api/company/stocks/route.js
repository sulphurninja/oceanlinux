import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { getIpStockRemaining, setIpStockCount, usesStockCount } from '@/lib/ipStockAvailability';
import {
  usesPreconfiguredInventory,
  countUnallocatedInventory,
  parseInventoryBulkLines,
  syncStockCountFromInventory,
  normalizeOsForServerType,
  resolveUsernameForOs,
  reconcileCompanyInventoryOrderIps,
} from '@/lib/companyInventory';
import Order from '@/models/orderModel';
import { COMPANY_FILTER_VERSION } from '@/lib/companyOrders';
import { buildCompanyValidityMismatchReport } from '@/lib/companyValidityMismatch';
const { hasCompanyResellerApi, getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');
const {
  fetchResellerCredentialsByIp,
  syncAllInventoryExpiriesFromReseller,
} = require('@/lib/companyResellerInventorySync');

async function getCompanySession() {
  const cookieStore = await cookies();
  const session = cookieStore.get('company_session')?.value;
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

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

function serializeStock(stock, companyDoc) {
  const hasInventory = usesPreconfiguredInventory(stock);
  return {
    _id: String(stock._id),
    name: stock.name,
    available: !!stock.available,
    stockCount: getIpStockRemaining(stock),
    usesStockCount: usesStockCount(stock, companyDoc),
    usesPreconfiguredInventory: hasInventory,
    inventoryTotal: stock.inventoryItems?.length || 0,
    inventoryAvailable: hasInventory ? countUnallocatedInventory(stock) : 0,
    inventoryItems: hasInventory ? (stock.inventoryItems || []).map(serializeInventoryItem) : [],
    serverType: stock.serverType,
    tags: stock.tags || [],
  };
}

export async function GET() {
  const company = await getCompanySession();
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'X-Deploy-Version': COMPANY_FILTER_VERSION } });
  }

  await connectDB();
  const [stocks, companyDoc] = await Promise.all([
    IPStock.find({ company: company.id }).sort({ name: 1 }).lean(),
    Company.findById(company.id).select('resellerApi netbayApi name').lean(),
  ]);

  const resellerCfg = getCompanyResellerApiConfig(companyDoc);
  const hasResellerSync = !!resellerCfg;

  return NextResponse.json({
    stocks: stocks.map((s) => serializeStock(s, companyDoc)),
    hasResellerSync,
    resellerLabel: resellerCfg?.label || 'Hostheaven',
  }, {
    headers: { 'X-Deploy-Version': COMPANY_FILTER_VERSION },
  });
}

export async function PUT(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const body = await request.json();
  const { stockId, stockCount, action, items, bulkLines, removeItemId, ipAddress, addToInventory } = body;

  if (action === 'syncAllResellerExpiries') {
    const companyDoc = await Company.findById(company.id).select('resellerApi netbayApi name').lean();
    if (!hasCompanyResellerApi(companyDoc)) {
      return NextResponse.json(
        { error: 'Hostheaven sync is not enabled. Ask admin to enable Reseller API on your company.' },
        { status: 403 }
      );
    }

    const stocks = await IPStock.find({ company: company.id });
    const { updated, failed, panelExpiriesByIp } = await syncAllInventoryExpiriesFromReseller(companyDoc, stocks);

    const stockIds = stocks.map((s) => s._id);
    const orders = stockIds.length
      ? await Order.find({
          ipStockId: { $in: stockIds },
          status: { $nin: ['cancelled', 'failed'] },
        })
          .select('_id expiryDate createdAt ipStockId ipAddress inventoryItemId')
          .lean()
      : [];

    const inventoryIpHeal = await reconcileCompanyInventoryOrderIps(stocks, orders);

    const serializedStocks = stocks.map((s) => serializeStock(s.toObject?.() || s, companyDoc));
    const mismatches = buildCompanyValidityMismatchReport(
      serializedStocks,
      orders,
      new Date(),
      panelExpiriesByIp
    );

    return NextResponse.json({
      success: true,
      message: `Synced expiry for ${updated.length} VPS`,
      updatedCount: updated.length,
      failedCount: failed.length,
      updated,
      failed,
      mismatches,
      mismatchCount: mismatches.length,
      mismatchIps: mismatches.map((m) => m.ipAddress),
      panelExpiriesByIp,
      stocks: serializedStocks,
    });
  }

  if (!stockId) {
    return NextResponse.json({ error: 'stockId is required' }, { status: 400 });
  }

  const stock = await IPStock.findOne({ _id: stockId, company: company.id });
  if (!stock) return NextResponse.json({ error: 'Stock not found or not yours' }, { status: 404 });

  const companyDoc = await Company.findById(company.id).select('netbayApi resellerApi name').lean();

  // Legacy: set numeric stock count only (no pre-config rows)
  if (action === 'setStockCount' || (stockCount !== undefined && !action)) {
    if (usesPreconfiguredInventory(stock)) {
      return NextResponse.json(
        { error: 'This stock uses pre-configured servers. Add inventory items instead of changing the count directly.' },
        { status: 400 }
      );
    }
    const count = Math.max(0, Math.floor(Number(stockCount) || 0));
    // Manual override: mark availabilityManual so live panel sync (PrimeVPS zone
    // status) does not wipe the count/availability the owner just set.
    await IPStock.collection.updateOne(
      { _id: stock._id },
      { $set: { stockCount: count, available: count > 0, availabilityManual: true } }
    );
    const updated = await IPStock.findById(stockId);
    return NextResponse.json({ success: true, stock: serializeStock(updated.toObject?.() || updated, companyDoc) });
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
      const duplicate = (stock.inventoryItems || []).some(
        (item) => String(item.ipAddress).split(':')[0].trim() === credentials.ipAddress
      );
      if (duplicate) {
        return NextResponse.json(
          { error: `IP ${credentials.ipAddress} is already in this stock` },
          { status: 400 }
        );
      }

      stock.inventoryItems = [
        ...(stock.inventoryItems || []),
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
      ];
      await stock.save();
      const synced = await syncStockCountFromInventory(stockId);
      return NextResponse.json({
        success: true,
        added: true,
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
        const os = normalizeOsForServerType(row.os, stock.serverType);
        newItems.push({
          ipAddress: String(row.ipAddress).trim(),
          username: resolveUsernameForOs(row.username, os),
          password: String(row.password).trim(),
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

    stock.inventoryItems = [...(stock.inventoryItems || []), ...newItems];
    await stock.save();
    const synced = await syncStockCountFromInventory(stockId);
    return NextResponse.json({
      success: true,
      added: newItems.length,
      stock: serializeStock(synced.toObject?.() || synced, companyDoc),
    });
  }

  if (action === 'removeInventory') {
    if (!removeItemId) {
      return NextResponse.json({ error: 'removeItemId is required' }, { status: 400 });
    }
    const before = stock.inventoryItems?.length || 0;
    stock.inventoryItems = (stock.inventoryItems || []).filter(
      (item) => String(item._id) !== String(removeItemId) || item.allocated
    );
    const removed = before - (stock.inventoryItems?.length || 0);
    if (removed === 0) {
      return NextResponse.json({ error: 'Item not found or already sold' }, { status: 400 });
    }
    await stock.save();
    const synced = await syncStockCountFromInventory(stockId);
    return NextResponse.json({ success: true, removed, stock: serializeStock(synced.toObject?.() || synced, companyDoc) });
  }

  return NextResponse.json(
    { error: 'Unknown action. Use setStockCount, addInventory, removeInventory, syncResellerCredentials, or syncAllResellerExpiries' },
    { status: 400 }
  );
}

export async function POST(request) {
  return PUT(request);
}
