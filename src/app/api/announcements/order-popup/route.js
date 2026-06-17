import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import Order from '@/models/orderModel';
import IPStock from '@/models/ipStockModel';
import mongoose from 'mongoose';
import { getDataFromToken } from '@/helper/getDataFromToken';
import {
  resolveProviderFromOrder,
  resolveCompanyIdFromIpStock,
} from '@/lib/orderAnnouncementTarget';

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

export async function GET(request) {
  try {
    await connectDB();

    const userId = await getDataFromToken(request);
    if (!userId) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) {
      return Response.json({ message: 'orderId is required' }, { status: 400 });
    }

    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    if (!order) {
      return Response.json({ message: 'Order not found' }, { status: 404 });
    }

    let ipStock = null;
    if (order.ipStockId) {
      ipStock = await IPStock.findById(order.ipStockId)
        .populate('company', 'name slug')
        .lean();
    }

    const provider = resolveProviderFromOrder(order, ipStock);
    const companyId = resolveCompanyIdFromIpStock(ipStock);

    const baseQuery = { status: 'sent', showOnOrderPage: true };

    if (companyId) {
      const companyPopup = await Announcement.findOne({
        ...baseQuery,
        targetCompany: new mongoose.Types.ObjectId(companyId),
      })
        .sort({ sentAt: -1, createdAt: -1 })
        .populate('targetCompany', 'name slug')
        .lean();

      if (companyPopup) {
        const company = companyPopup.targetCompany;
        companyPopup.targetLabel = company
          ? `${company.name} (/company/${company.slug})`
          : 'Company';
        return Response.json({ popup: sanitizePopup(companyPopup), match: 'company' });
      }
    }

    const providerPopup = await Announcement.findOne({
      ...baseQuery,
      targetProvider: provider,
      $or: [{ targetCompany: null }, { targetCompany: { $exists: false } }],
    })
      .sort({ sentAt: -1, createdAt: -1 })
      .lean();

    if (providerPopup) {
      providerPopup.targetLabel = provider.toUpperCase();
      return Response.json({ popup: sanitizePopup(providerPopup), match: 'provider', provider });
    }

    return Response.json({
      popup: null,
      hint: companyId
        ? `No live company news for this order's company. Provider is "${provider}".`
        : `No live provider news for "${provider}". Add news in the matching admin column and enable it.`,
      provider,
      companyId: companyId || null,
    });
  } catch (error) {
    console.error('Error fetching order popup announcement:', error);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
