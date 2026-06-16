import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { getIpStockRemaining, setIpStockCount, usesStockCount } from '@/lib/ipStockAvailability';

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

function serializeStock(stock) {
  return {
    _id: String(stock._id),
    name: stock.name,
    available: !!stock.available,
    stockCount: getIpStockRemaining(stock),
    usesStockCount: usesStockCount(stock),
    serverType: stock.serverType,
    tags: stock.tags || [],
  };
}

export async function GET() {
  const company = await getCompanySession();
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'X-Deploy-Version': 'confirmed-only-v5' } });
  }

  await connectDB();
  const stocks = await IPStock.find({ company: company.id }).sort({ name: 1 }).lean();
  return NextResponse.json(stocks.map(serializeStock), {
    headers: { 'X-Deploy-Version': 'confirmed-only-v5' },
  });
}

export async function PUT(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { stockId, stockCount } = await request.json();

  if (!stockId || stockCount === undefined || stockCount === null) {
    return NextResponse.json({ error: 'stockId and stockCount are required' }, { status: 400 });
  }

  const stock = await IPStock.findOne({ _id: stockId, company: company.id });
  if (!stock) return NextResponse.json({ error: 'Stock not found or not yours' }, { status: 404 });

  const updated = await setIpStockCount(stockId, stockCount);
  return NextResponse.json({ success: true, stock: serializeStock(updated) });
}
