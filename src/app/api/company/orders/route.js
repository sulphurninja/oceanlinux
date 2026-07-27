import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { resolveCompanySession } from '@/lib/companySession';
import IPStock from '@/models/ipStockModel';
import Order from '@/models/orderModel';
import {
  COMPANY_FILTER_VERSION,
  COMPANY_VISIBLE_ORDER_STATUSES,
  isCompanyVisibleOrder,
  buildCompanyStockIdVariants,
} from '@/lib/companyOrders';
import {
  defaultOsForServerType,
  normalizeOsForServerType,
  resolveUsernameForOs,
  syncCompanyInventoryAfterOrderUpdate,
} from '@/lib/companyInventory';
import { toObjectIdString } from '@/lib/queryIds';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function responseHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Company-Orders-Filter': COMPANY_FILTER_VERSION,
  };
}

export async function GET() {
  const company = await resolveCompanySession();
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders() });
  }

  await connectDB();

  const stocks = await IPStock.find({ company: company.id }).select('_id name serverType').lean();
  const stockIds = stocks.map(s => s._id.toString());

  if (stockIds.length === 0) {
    return NextResponse.json(
      { orders: [], filterVersion: COMPANY_FILTER_VERSION },
      { headers: responseHeaders() }
    );
  }

  const orders = await Order.find({
    ipStockId: { $in: buildCompanyStockIdVariants(stockIds) },
    status: { $in: COMPANY_VISIBLE_ORDER_STATUSES },
  })
    .select(
      'productName memory ipAddress username password os status provisioningStatus createdAt expiryDate customerName customerEmail ipStockId panelUsername inventoryItemId'
    )
    .sort({ createdAt: -1 })
    .lean();

  const stockMap = {};
  stocks.forEach(s => {
    stockMap[s._id.toString()] = { name: s.name, serverType: s.serverType };
  });

  const enriched = orders
    .filter(isCompanyVisibleOrder)
    .map(o => {
      const stock = stockMap[String(o.ipStockId)] || {};
      return {
        ...o,
        stockName: stock.name || 'Unknown',
        serverType: stock.serverType || 'Linux',
      };
    });

  return NextResponse.json(
    { orders: enriched, filterVersion: COMPANY_FILTER_VERSION },
    { headers: responseHeaders() }
  );
}

export async function PUT(request) {
  const company = await resolveCompanySession();
  if (!company) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders() });
  }

  await connectDB();

  const { orderId, ipAddress, username, password, os } = await request.json();
  const safeOrderId = toObjectIdString(orderId);
  if (!safeOrderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400, headers: responseHeaders() });
  }

  const stocks = await IPStock.find({ company: company.id }).select('_id serverType').lean();
  const stockIds = stocks.map(s => s._id.toString());
  const stockTypeMap = Object.fromEntries(stocks.map((s) => [s._id.toString(), s.serverType]));

  const order = await Order.findOne({
    _id: safeOrderId,
    ipStockId: { $in: buildCompanyStockIdVariants(stockIds) },
    status: { $in: COMPANY_VISIBLE_ORDER_STATUSES },
  });

  if (!order || !isCompanyVisibleOrder(order)) {
    return NextResponse.json({ error: 'Order not found or not authorized' }, { status: 404, headers: responseHeaders() });
  }

  const serverType = stockTypeMap[String(order.ipStockId)] || 'Linux';
  const normalizedOs = os !== undefined
    ? normalizeOsForServerType(os, serverType)
    : (order.os || defaultOsForServerType(serverType));

  const updateFields = {};
  if (ipAddress !== undefined) updateFields.ipAddress = String(ipAddress).split(':')[0].trim();
  if (username !== undefined) updateFields.username = resolveUsernameForOs(username, normalizedOs);
  if (password !== undefined) updateFields.password = password;
  if (os !== undefined) updateFields.os = normalizedOs;
  updateFields.status = 'active';
  updateFields.provisioningStatus = 'active';

  try {
    await syncCompanyInventoryAfterOrderUpdate(order, {
      ipAddress: updateFields.ipAddress,
      username: updateFields.username,
      password: updateFields.password,
      os: updateFields.os,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Failed to sync inventory with order update' },
      { status: 400, headers: responseHeaders() }
    );
  }

  await Order.updateOne(
    { _id: safeOrderId, ipStockId: { $in: buildCompanyStockIdVariants(stockIds) } },
    { $set: updateFields }
  );

  return NextResponse.json({ success: true, message: 'Order updated' }, { headers: responseHeaders() });
}
