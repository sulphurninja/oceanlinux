import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

const {
  toPlainConfigurations,
  isAdvpsIpStockName,
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
} = require('@/lib/advpsLiveStock');

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

export async function GET() {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const stocks = await IPStock.find({ company: company.id }).lean();
  return NextResponse.json(stocks);
}

export async function PUT(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { stockId, available } = await request.json();

  const stock = await IPStock.findOne({ _id: stockId, company: company.id });
  if (!stock) return NextResponse.json({ error: 'Stock not found or not yours' }, { status: 404 });

  const plain = toPlainConfigurations(stock.defaultConfigurations);
  const advps = plain.advps;

  if (isAdvpsIpStockName(String(stock.name)) && advps && typeof advps === 'object') {
    try {
      const stockMap = await fetchAdvpsStockMap(advps);
      const advpsLive = JSON.parse(JSON.stringify(advps));
      stock.available = applyStockMapToAdvpsBlock(advpsLive, stockMap);
      stock.defaultConfigurations = { ...plain, advps: advpsLive };
    } catch (e) {
      console.error('[COMPANY-STOCKS] ADVPS availability fetch failed:', e.message);
      stock.available = available;
    }
  } else {
    stock.available = available;
  }

  await stock.save();

  return NextResponse.json({ success: true, available: stock.available });
}
