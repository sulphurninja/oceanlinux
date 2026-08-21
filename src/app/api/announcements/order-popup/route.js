import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import mongoose from 'mongoose';
import { getDataFromToken, AuthError } from '@/helper/getDataFromToken';
import { pickOrderPageAnnouncement } from '@/lib/orderPopupMatch';

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizePopup(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    title: doc.title,
    content: doc.content,
    communityLink: isValidHttpUrl(doc.communityLink) ? doc.communityLink : '',
    actionText: doc.actionText || '',
    actionUrl: isValidHttpUrl(doc.actionUrl) ? doc.actionUrl : '',
    type: doc.type || 'update',
    targetLabel: doc.targetLabel || '',
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : '',
  };
}

function userOwnsOrder(order, userId) {
  return String(order.user) === String(userId);
}

async function loadIpStockForOrder(order) {
  if (!order?.ipStockId) return null;

  const rawId = String(order.ipStockId).trim();
  if (!rawId) return null;

  let ipStock = null;

  if (mongoose.Types.ObjectId.isValid(rawId)) {
    ipStock = await IPStock.findById(rawId).populate('company', 'name slug').lean();
  }

  if (!ipStock) {
    ipStock = await IPStock.findOne({ _id: rawId }).populate('company', 'name slug').lean();
  }

  return ipStock;
}

export async function GET(request) {
  try {
    await connectDB();

    let userId;
    try {
      userId = getDataFromToken(request);
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Unauthorized';
      return Response.json({ message }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId')?.trim();
    if (!orderId) {
      return Response.json({ message: 'orderId is required' }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return Response.json({ message: 'Invalid orderId' }, { status: 400 });
    }

    const order = await Order.findById(orderId).lean();
    if (!order || !userOwnsOrder(order, userId)) {
      return Response.json({ message: 'Order not found' }, { status: 404 });
    }

    const ipStock = await loadIpStockForOrder(order);

    const announcements = await Announcement.find({ showOnOrderPage: true })
      .sort({ sentAt: -1, createdAt: -1 })
      .populate('targetCompany', 'name slug')
      .lean();

    const result = pickOrderPageAnnouncement(order, ipStock, announcements);

    if (result.popup) {
      const popup = { ...result.popup };
      if (result.match === 'company') {
        const company = popup.targetCompany;
        popup.targetLabel = company?.name
          ? `${company.name}${company.slug ? ` (/company/${company.slug})` : ''}`
          : 'Company';
      } else {
        popup.targetLabel = (result.provider || 'provider').toUpperCase();
      }

      return Response.json({
        popup: sanitizePopup(popup),
        match: result.match,
        provider: result.provider,
        companyId: result.companyId,
      });
    }

    return Response.json({
      popup: null,
      hint: result.companyId
        ? `No live company news for this order's company. Resolved provider is "${result.provider}".`
        : `No live provider news for "${result.provider}". Publish in Admin → Announcements → Manage Order News → ${result.provider.toUpperCase()}.`,
      provider: result.provider,
      companyId: result.companyId,
      debug: {
        orderProvider: order.provider || null,
        advpsServiceId: order.advpsServiceId || null,
        ipStockId: order.ipStockId || null,
        ipStockTags: ipStock?.tags || [],
        liveOrderNewsCount: announcements.filter((a) => a.status === 'sent').length,
      },
    });
  } catch (error) {
    console.error('Error fetching order popup announcement:', error);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
