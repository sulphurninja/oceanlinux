import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Company portal orders tab: confirmed (paid) only — never cancelled/pending/failed/active. */
const FILTER_VERSION = 'confirmed-only-v5';

function responseHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Company-Orders-Filter': FILTER_VERSION,
  };
}

function isConfirmedOrder(order) {
  return String(order?.status ?? '').trim().toLowerCase() === 'confirmed';
}

function stockIdVariants(stockIds) {
  const variants = new Set();
  for (const id of stockIds) {
    const value = String(id || '').trim();
    if (!value) continue;
    variants.add(value);
    if (/^[a-f0-9]{24}$/i.test(value)) variants.add(value.toLowerCase());
  }
  return [...variants];
}

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
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders() });
  }

  await connectDB();

  const stocks = await IPStock.find({ company: company.id }).select('_id name').lean();
  const stockIds = stocks.map(s => s._id.toString());

  if (stockIds.length === 0) {
    return NextResponse.json(
      { orders: [], filterVersion: FILTER_VERSION },
      { headers: responseHeaders() }
    );
  }

  const orders = await Order.find({
    ipStockId: { $in: stockIdVariants(stockIds) },
    status: 'confirmed',
  })
    .select(
      'productName memory ipAddress username password os status provisioningStatus createdAt expiryDate customerName customerEmail ipStockId panelUsername'
    )
    .sort({ createdAt: -1 })
    .lean();

  const stockMap = {};
  stocks.forEach(s => { stockMap[s._id.toString()] = s.name; });

  const enriched = orders
    .filter(isConfirmedOrder)
    .map(o => ({
      ...o,
      stockName: stockMap[String(o.ipStockId)] || 'Unknown',
    }));

  return NextResponse.json(
    { orders: enriched, filterVersion: FILTER_VERSION },
    { headers: responseHeaders() }
  );
}

export async function PUT(request) {
  const company = await getCompanySession();
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders() });
  }

  await connectDB();

  const { orderId, ipAddress, username, password, os } = await request.json();
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400, headers: responseHeaders() });
  }

  const stocks = await IPStock.find({ company: company.id }).select('_id').lean();
  const stockIds = stocks.map(s => s._id.toString());

  const order = await Order.findOne({
    _id: orderId,
    ipStockId: { $in: stockIdVariants(stockIds) },
    status: 'confirmed',
  });

  if (!order || !isConfirmedOrder(order)) {
    return NextResponse.json({ error: 'Order not found or not authorized' }, { status: 404, headers: responseHeaders() });
  }

  const updateFields = {};
  if (ipAddress !== undefined) updateFields.ipAddress = ipAddress;
  if (username !== undefined) updateFields.username = username;
  if (password !== undefined) updateFields.password = password;
  if (os !== undefined) updateFields.os = os;
  updateFields.status = 'active';
  updateFields.provisioningStatus = 'active';

  await Order.updateOne({ _id: orderId }, { $set: updateFields });

  return NextResponse.json({ success: true, message: 'Order updated' }, { headers: responseHeaders() });
}
