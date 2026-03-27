import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';

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

  const stocks = await IPStock.find({ company: company.id }).select('_id name').lean();
  const stockIds = stocks.map(s => s._id.toString());

  if (stockIds.length === 0) {
    return NextResponse.json([]);
  }

  const orders = await Order.find({
    ipStockId: { $in: stockIds },
    status: { $nin: ['pending'] },
  })
    .select('productName memory ipAddress username password os status provisioningStatus createdAt expiryDate customerName customerEmail ipStockId panelUsername')
    .sort({ createdAt: -1 })
    .lean();

  const stockMap = {};
  stocks.forEach(s => { stockMap[s._id.toString()] = s.name; });

  const enriched = orders.map(o => ({
    ...o,
    stockName: stockMap[o.ipStockId] || 'Unknown',
  }));

  return NextResponse.json(enriched);
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

  const order = await Order.findOne({
    _id: orderId,
    ipStockId: { $in: stockIds },
    status: { $nin: ['pending'] },
  });

  if (!order) {
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
