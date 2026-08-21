import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import IPStock from '@/models/ipStockModel';
import { requireAdmin } from '@/lib/adminAuth';
import {
  getIpStockRemaining,
  setIpStockCount,
  setAllCompanyIpStockCounts,
  usesStockCount,
  usesNetbayLiveStock,
  usesResellerLiveStock,
  usesKurohostLiveStock,
} from '@/lib/ipStockAvailability';

function serializeStock(stock, company) {
  const memoryOptions = stock.memoryOptions
    ? Object.fromEntries(
        stock.memoryOptions instanceof Map
          ? stock.memoryOptions.entries()
          : Object.entries(stock.memoryOptions)
      )
    : {};
  return {
    _id: String(stock._id),
    name: stock.name,
    available: !!stock.available,
    stockCount: getIpStockRemaining(stock, company),
    usesStockCount: usesStockCount(stock, company),
    netbayLiveStock: usesNetbayLiveStock(stock, company),
    kurohostLiveStock: usesKurohostLiveStock(stock, company),
    resellerLiveStock: usesResellerLiveStock(stock, company),
    serverType: stock.serverType,
    tags: stock.tags || [],
    memorySizes: Object.keys(memoryOptions),
  };
}

/** List IP stocks linked to this company (admin). */
export async function GET(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { id } = await params;

  const company = await Company.findById(id).select('name slug netbayApi kurohostApi resellerApi').lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const stocks = await IPStock.find({ company: id }).sort({ name: 1 }).lean();
  return NextResponse.json({
    company: { _id: String(company._id), name: company.name, slug: company.slug },
    kurohostUseLiveStockApi: company.kurohostApi?.enabled === true,
    netbayUseLiveStockApi: company.netbayApi?.useLiveStockApi === true,
    resellerUseLiveStockApi: company.resellerApi?.useLiveStockApi === true,
    stocks: stocks.map((s) => serializeStock(s, company)),
  });
}

/** Set manual stock count for all (or one) of the company's IP stocks (admin). */
export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const { stockId, stockCount, applyToAll } = await request.json();

  if (stockCount === undefined || stockCount === null) {
    return NextResponse.json({ error: 'stockCount is required' }, { status: 400 });
  }

  const company = await Company.findById(id).select('_id netbayApi kurohostApi resellerApi').lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  if (company.kurohostApi?.enabled === true) {
    return NextResponse.json(
      { error: 'KuroHost zone stock is ON — stock follows GET /zones. Set cloudZoneId in manageIpStock instead of manual units.' },
      { status: 400 }
    );
  }

  if (company.netbayApi?.useLiveStockApi === true) {
    return NextResponse.json(
      { error: 'Live NetBay API stock is ON — turn Live stock OFF in the Netbay dialog to set manual units.' },
      { status: 400 }
    );
  }

  if (company.resellerApi?.useLiveStockApi === true) {
    return NextResponse.json(
      { error: 'Live Reseller API stock is ON — turn Live stock OFF in the Reseller dialog to set manual units.' },
      { status: 400 }
    );
  }

  if (applyToAll || !stockId) {
    const updated = await setAllCompanyIpStockCounts(id, stockCount, company);
    if (updated.length === 0) {
      return NextResponse.json({ error: 'No manual stocks linked to this company' }, { status: 404 });
    }
    const count = Math.max(0, Math.floor(Number(stockCount) || 0));
    return NextResponse.json({
      success: true,
      updated: updated.length,
      stockCount: count,
      stocks: updated.map((s) => serializeStock(s, company)),
    });
  }

  const existing = await IPStock.findOne({ _id: stockId, company: id });
  if (!existing) {
    return NextResponse.json({ error: 'Stock not found or not linked to this company' }, { status: 404 });
  }

  if (usesNetbayLiveStock(existing, company)) {
    return NextResponse.json(
      { error: 'Live NetBay API stock is ON — turn Live stock OFF in the Netbay dialog to set manual units.' },
      { status: 400 }
    );
  }

  if (usesKurohostLiveStock(existing, company)) {
    return NextResponse.json(
      { error: 'KuroHost zone stock is ON — configure cloudZoneId in manageIpStock; stock syncs from KuroHost zones API.' },
      { status: 400 }
    );
  }

  if (usesResellerLiveStock(existing, company)) {
    return NextResponse.json(
      { error: 'Live Reseller API stock is ON — turn Live stock OFF in the Reseller dialog to set manual units.' },
      { status: 400 }
    );
  }

  const stock = await setIpStockCount(stockId, stockCount);
  return NextResponse.json({ success: true, stock: serializeStock(stock, company) });
}
