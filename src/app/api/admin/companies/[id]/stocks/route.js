import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/db';
import Company from '@/models/companyModel';
import IPStock from '@/models/ipStockModel';
import User from '@/models/userModel';
import { getIpStockRemaining, setIpStockCount, usesStockCount } from '@/lib/ipStockAvailability';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await connectDB();
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'Admin') return null;
    return user;
  } catch {
    return null;
  }
}

function serializeStock(stock) {
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
    stockCount: getIpStockRemaining(stock),
    usesStockCount: usesStockCount(stock),
    serverType: stock.serverType,
    tags: stock.tags || [],
    memorySizes: Object.keys(memoryOptions),
  };
}

/** List IP stocks linked to this company (admin). */
export async function GET(_request, { params }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { id } = await params;

  const company = await Company.findById(id).select('name slug').lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const stocks = await IPStock.find({ company: id }).sort({ name: 1 }).lean();
  return NextResponse.json({
    company: { _id: String(company._id), name: company.name, slug: company.slug },
    stocks: stocks.map(serializeStock),
  });
}

/** Set stock count for one of the company's IP stocks (admin). */
export async function PUT(request, { params }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const { id } = await params;
  const { stockId, stockCount } = await request.json();

  if (!stockId || stockCount === undefined || stockCount === null) {
    return NextResponse.json({ error: 'stockId and stockCount are required' }, { status: 400 });
  }

  const company = await Company.findById(id).select('_id').lean();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const existing = await IPStock.findOne({ _id: stockId, company: id });
  if (!existing) {
    return NextResponse.json({ error: 'Stock not found or not linked to this company' }, { status: 404 });
  }

  const stock = await setIpStockCount(stockId, stockCount);
  return NextResponse.json({ success: true, stock: serializeStock(stock) });
}
