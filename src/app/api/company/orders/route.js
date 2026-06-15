import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  buildCompanyStockIdVariants,
  COMPANY_VISIBLE_ORDER_STATUSES,
  isCompanyVisibleOrder,
} from '@/lib/companyOrders';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
      {
        orders: [],
        filterVersion: 'confirmed-active-only-v3',
        visibleStatuses: COMPANY_VISIBLE_ORDER_STATUSES,
      },
      { headers: responseHeaders() }
    );
  }

  const stockIdVariants = buildCompanyStockIdVariants(stockIds);

  const orders = await Order.find({
    ipStockId: { $in: stockIdVariants },
    status: { $in: COMPANY_VISIBLE_ORDER_STATUSES },
  })
    .select(
      'productName memory ipAddress username password os status provisioningStatus createdAt expiryDate customerName customerEmail ipStockId panelUsername'
    )
    .sort({ createdAt: -1 })
    .lean();

  const stockMap = {};
  stocks.forEach(s => { stockMap[s._id.toString()] = s.name; });

  const enriched = orders
    .filter(isCompanyVisibleOrder)
    .map(o => ({
      ...o,
      stockName: stockMap[String(o.ipStockId)] || 'Unknown',
    }));

  return NextResponse.json(
    {
      orders: enriched,
      filterVersion: 'confirmed-active-only-v3',
      visibleStatuses: COMPANY_VISIBLE_ORDER_STATUSES,
    },
    { headers: responseHeaders() }
  );
}

export async function PUT(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { orderId, ipAddress, username, password, os } = await request.json();

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  const stocks = await IPStock.find({ company: company.id }).select('_id').lean();
  const stockIds = stocks.map(s => s._id.toString());
  const stockIdVariants = buildCompanyStockIdVariants(stockIds);

  const order = await Order.findOne({
    _id: orderId,
    ipStockId: { $in: stockIdVariants },
    status: { $in: COMPANY_VISIBLE_ORDER_STATUSES },
  });

  if (!order || !isCompanyVisibleOrder(order)) {
    return NextResponse.json({ error: 'Order not found or not authorized' }, { status: 404 });
  }

  const updateFields = {};
  if (ipAddress !== undefined) updateFields.ipAddress = ipAddress;
  if (username !== undefined) updateFields.username = username;
  if (password !== undefined) updateFields.password = password;
  if (os !== undefined) updateFields.os = os;

  updateFields.status = 'active';
  updateFields.provisioningStatus = 'active';

  await Order.updateOne({ _id: orderId }, { $set: updateFields });

  return NextResponse.json({ success: true, message: 'Order updated' });
}

function responseHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Company-Orders-Filter': 'confirmed-active-only-v3',
  };
}
