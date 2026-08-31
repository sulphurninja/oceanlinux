import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceCronSecret } from '@/lib/apiSecurity';

const HostycareAPI = require('@/services/hostycareApi');
const SmartVPSAPI = require('@/services/smartvpsApi');
const { executeAdvpsUpstreamRenewal } = require('@/lib/advpsRenewal');
const { executeNetbayUpstreamRenewal } = require('@/lib/netbayRenewal');
const { executeResellerPanelUpstreamRenewal } = require('@/lib/resellerPanelRenewal');

function pickHostycareExpiry(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const raw =
    payload.nextduedate ||
    payload.nextDueDate ||
    payload.expiryDate ||
    payload.expiry ||
    payload.expires_at ||
    payload.expiresAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function retryHostycare(order) {
  const api = new HostycareAPI();
  const result = await api.renewService(order.hostycareServiceId);
  let panelExpiry = null;
  try {
    const info = await api.getServiceInfo(order.hostycareServiceId);
    panelExpiry = pickHostycareExpiry(info?.service || info?.data || info);
  } catch (_) {}
  return { success: true, result, panelExpiry, provider: 'hostycare' };
}

async function retryByProvider(order) {
  if (order.hostycareServiceId) {
    return retryHostycare(order);
  }
  if (order.advpsServiceId) {
    const AdvpsApi = require('@/services/advpsApi');
    const { getCompanyAdvpsApiConfig } = require('@/lib/companyAdvpsApi');
    const IPStock = require('@/models/ipStockModel');
    const Company = (await import('@/models/companyModel')).default;
    const ipStock = await IPStock.findById(order.ipStockId).select('company').lean();
    const company = ipStock?.company ? await Company.findById(ipStock.company).lean() : null;
    const cfg = company ? getCompanyAdvpsApiConfig(company) : null;
    const api = cfg ? new AdvpsApi(cfg) : null;
    if (!api) throw new Error('ADVPS not configured');
    const out = await executeAdvpsUpstreamRenewal(api, order, { Order });
    return { ...out, provider: 'advps' };
  }
  if (order.netbayServiceId) {
    const out = await executeNetbayUpstreamRenewal(order);
    return { ...out, provider: 'netbay' };
  }
  if (String(order.provider || '').toLowerCase() === 'reseller-api' || order.resellerVmId) {
    const out = await executeResellerPanelUpstreamRenewal(order, { Order });
    return { ...out, provider: 'reseller-api' };
  }
  if (order.smartvpsServiceId || String(order.provider || '').toLowerCase() === 'smartvps') {
    const api = new SmartVPSAPI();
    const serviceId = order.smartvpsServiceId || order.ipAddress;
    const result = await api.renewVps(serviceId);
    return { success: true, result, provider: 'smartvps' };
  }
  throw new Error('No upstream provider identifier on this order');
}

/**
 * POST /api/internal/retry-upstream-renewal
 * Cron-only: retry failed provider renewal after customer payment succeeded.
 * Body: { orderId } or { ipAddress }
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  await connectDB();

  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, ipAddress } = body;

    let order = null;
    if (orderId) {
      order = await Order.findById(orderId);
    } else if (ipAddress) {
      const clean = String(ipAddress).split(':')[0].trim();
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      order = await Order.findOne({
        ipAddress: new RegExp(`^${escaped}(?:$|:)`, 'i'),
      });
    }

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const renewalPayments = Array.isArray(order.renewalPayments) ? [...order.renewalPayments] : [];
    const lastIdx = renewalPayments.length - 1;
    const lastRenewal = lastIdx >= 0 ? renewalPayments[lastIdx] : null;

    if (!lastRenewal) {
      return NextResponse.json(
        { success: false, message: 'No renewal payment on order to retry upstream for' },
        { status: 400 }
      );
    }

    if (lastRenewal.providerRenewalSuccess === true) {
      return NextResponse.json({
        success: true,
        alreadyRenewed: true,
        message: 'Upstream renewal already marked successful',
        orderId: order._id,
      });
    }

    let upstream;
    try {
      upstream = await retryByProvider(order);
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          message: err.message || 'Upstream renewal failed',
          orderId: order._id,
        },
        { status: 502 }
      );
    }

    if (!upstream?.success) {
      return NextResponse.json(
        {
          success: false,
          message: upstream?.error || 'Upstream renewal failed',
          orderId: order._id,
          upstream,
        },
        { status: 502 }
      );
    }

    renewalPayments[lastIdx] = {
      ...(lastRenewal.toObject?.() || lastRenewal),
      providerRenewalSuccess: true,
      providerRenewalResult: upstream.result || upstream,
      providerRenewalRetriedAt: new Date(),
    };

    const update = {
      renewalPayments,
      lastAction: 'renew',
      lastActionTime: new Date(),
    };
    const panelExpiry = upstream.panelExpiry || upstream.newExpiryDate;
    if (panelExpiry) update.expiryDate = panelExpiry;

    await Order.findByIdAndUpdate(order._id, { $set: update });

    return NextResponse.json({
      success: true,
      message: 'Upstream renewal completed',
      orderId: order._id,
      customerEmail: order.customerEmail,
      ipAddress: order.ipAddress,
      provider: upstream.provider,
      expiryDate: panelExpiry || order.expiryDate,
      upstream: upstream.result || upstream,
    });
  } catch (error) {
    console.error('[RETRY-UPSTREAM-RENEWAL]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Retry failed' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return POST(request);
}
