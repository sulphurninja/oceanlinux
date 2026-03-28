import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import ServerActionRequest from '@/models/serverActionRequestModel';

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

async function getCompanyOrderIds(companyId) {
  const stocks = await IPStock.find({ company: companyId }).select('_id').lean();
  const stockIds = stocks.map(s => s._id.toString());
  if (stockIds.length === 0) return [];

  const orders = await Order.find({ ipStockId: { $in: stockIds } }).select('_id').lean();
  return orders.map(o => o._id);
}

export async function GET(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const orderIds = await getCompanyOrderIds(company.id);
  if (orderIds.length === 0) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';

  const requests = await ServerActionRequest.find({
    orderId: { $in: orderIds },
    status,
  })
    .sort({ requestedAt: -1 })
    .populate('userId', 'name email')
    .lean();

  return NextResponse.json(requests);
}

export async function POST(request) {
  const company = await getCompanySession();
  if (!company) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { requestId, action, adminNotes, newPassword } = await request.json();

  if (!requestId || !action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const orderIds = await getCompanyOrderIds(company.id);

  const actionRequest = await ServerActionRequest.findOne({
    _id: requestId,
    orderId: { $in: orderIds },
    status: 'pending',
  });

  if (!actionRequest) {
    return NextResponse.json({ error: 'Request not found or already processed' }, { status: 404 });
  }

  actionRequest.status = action === 'approve' ? 'approved' : 'rejected';
  actionRequest.processedAt = new Date();
  if (adminNotes) actionRequest.adminNotes = adminNotes;
  await actionRequest.save();

  if (action === 'approve') {
    const updateFields = {
      lastAction: actionRequest.action,
      lastActionTime: new Date(),
    };
    if (actionRequest.action === 'format' && newPassword) {
      updateFields.password = newPassword;
    }
    await Order.findByIdAndUpdate(actionRequest.orderId, updateFields);
  }

  return NextResponse.json({ success: true, message: `Request ${actionRequest.status}` });
}
