import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import IPStock from '@/models/ipStockModel';
import { isCronAuthorized } from '@/lib/apiSecurity';

const RackatoApi = require('@/services/rackatoApi');
const { getCompanyRackatoApiConfig } = require('@/lib/companyRackatoApi');
const {
  productRows,
  normalizeProductRow,
  findBestCatalogProduct,
  pickRackatoApp,
  resolveDiskSizeForOrder,
} = require('@/lib/rackatoCatalogSync');

async function listAllProducts(api) {
  const seen = new Set();
  const products = [];
  let page = 1;
  const limit = 100;
  while (page <= 25) {
    const payload = await api.listProducts({ page, limit });
    const rows = productRows(payload).map(normalizeProductRow).filter(Boolean);
    if (!rows.length) break;
    let added = 0;
    for (const row of rows) {
      const key = row.id;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(row);
      added += 1;
    }
    if (rows.length < limit || added === 0) break;
    page += 1;
  }
  return products;
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const body = await request.json().catch(() => ({}));
  const stockId = String(body.stockId || '').trim();
  const memoryKeys = Array.isArray(body.memoryKeys) && body.memoryKeys.length
    ? body.memoryKeys.map(String)
    : null;

  if (!stockId) {
    return NextResponse.json({ success: false, message: 'stockId is required' }, { status: 400 });
  }

  const stock = await IPStock.findById(stockId);
  if (!stock) {
    return NextResponse.json({ success: false, message: 'IP stock not found' }, { status: 404 });
  }

  const company = await Company.findById(stock.company).lean();
  const cfg = getCompanyRackatoApiConfig(company);
  if (!cfg) {
    return NextResponse.json({ success: false, message: 'Rackato API not configured' }, { status: 400 });
  }

  try {
    const api = new RackatoApi(cfg);
    const catalog = await listAllProducts(api);
    const memOpts = stock.memoryOptions instanceof Map
      ? Object.fromEntries(stock.memoryOptions)
      : (stock.memoryOptions || {});
    const keys = memoryKeys || Object.keys(memOpts);
    const updates = {};
    const isWindows = /windows/i.test(String(stock.name || ''));

    for (const memoryKey of keys) {
      const match = findBestCatalogProduct(catalog, {
        memoryKey,
        stockName: stock.name,
        isWindows,
      });
      if (!match) {
        updates[memoryKey] = { error: 'No matching Rackato product in catalog' };
        continue;
      }
      const app = pickRackatoApp(match.apps, { isWindows });
      if (!app) {
        updates[memoryKey] = { error: `Product ${match.id} has no apps`, productId: match.id };
        continue;
      }
      const disk = resolveDiskSizeForOrder(null, match);
      updates[memoryKey] = {
        productId: match.id,
        appId: String(app.id),
        diskSize: disk.diskSize,
        includeDiskSize: disk.includeDiskSize,
        productName: match.name,
        appName: app.name,
      };
    }

    const byMemory = { ...(stock.defaultConfigurations?.rackato?.byMemory || {}) };
    for (const [key, row] of Object.entries(updates)) {
      if (row.error || !row.productId) continue;
      byMemory[key] = {
        productId: row.productId,
        appId: row.appId,
        diskSize: row.diskSize,
        includeDiskSize: row.includeDiskSize,
      };
    }

    const firstOk = Object.values(updates).find((r) => r.productId && !r.error);
    const rackatoCfg = {
      ...(stock.defaultConfigurations?.rackato || {}),
      byMemory,
      ...(firstOk
        ? {
          productId: firstOk.productId,
          appId: firstOk.appId,
          diskSize: firstOk.diskSize,
          includeDiskSize: firstOk.includeDiskSize,
        }
        : {}),
    };

    stock.set('defaultConfigurations.rackato', rackatoCfg);
    await stock.save();

    return NextResponse.json({
      success: true,
      stockId,
      catalogCount: catalog.length,
      updates,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err.message || 'Rackato sync failed',
    }, { status: 502 });
  }
}
