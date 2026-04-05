import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';

const {
  toPlainConfigurations,
  isAdvpsIpStockName,
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  cloneAdvpsForMutation,
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
      console.log('[COMPANY-STOCKS][ADVPS] resolving availability', {
        stockId: String(stock._id),
        name: stock.name,
        clientSentAvailable: available,
      });
      const advpsLive = cloneAdvpsForMutation(advps);
      if (advpsLive) {
        const stockMap = await fetchAdvpsStockMap(advpsLive, { verbose: false });
        stock.available = applyStockMapToAdvpsBlock(advpsLive, stockMap, {
          verbose: true,
          label: stock.name,
          ipStockId: stock._id,
        });
        stock.defaultConfigurations = { ...plain, advps: advpsLive };
        console.log('[COMPANY-STOCKS][ADVPS] resolved', {
          stockId: String(stock._id),
          name: stock.name,
          finalAvailable: stock.available,
        });
      } else {
        stock.available = available;
        console.warn('[COMPANY-STOCKS][ADVPS] clone null, using client available', { stockId: String(stock._id) });
      }
    } catch (e) {
      console.error('[COMPANY-STOCKS][ADVPS] fetch failed:', e.message, e.stack);
      stock.available = available;
    }
  } else {
    stock.available = available;
  }

  await stock.save();

  return NextResponse.json({ success: true, available: stock.available });
}
