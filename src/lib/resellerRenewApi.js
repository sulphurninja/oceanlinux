/**
 * Reseller order renewal — wallet deduct + upstream provider renew + expiry extend.
 */

import Order from '@/models/orderModel';
import Reseller from '@/models/resellerModel';
import ResellerWalletService from '@/services/resellerWalletService';
import { calculateRenewalExpiryDate, getDaysUntilExpiry, isWithinRenewalWindow, RENEWAL_DAYS_BEFORE_EXPIRY } from '@/lib/expiryHelper';
import { resolveRenewalProvider, detectCompanyManagedRenewal } from '@/lib/companyRenewal';
import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { calculateResellerPlanPrice } from '@/lib/resellerOrderApi';
import { getCurrentListPriceForOrder } from '@/lib/orderRenewalPricingServer';
import IPStock from '@/models/ipStockModel';
import { notifyRenewalCompleted } from '@/lib/renewalNotifications';

const HostycareAPI = require('@/services/hostycareApi');
const SmartVpsAPI = require('@/services/smartvpsApi');
const AdvpsAPI = require('@/services/advpsApi');
const { executeAdvpsUpstreamRenewal } = require('@/lib/advpsRenewal');
const { pickAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const { extractAdvpsStatusCredentials } = require('@/lib/advpsStatusNormalize');

async function resolveResellerRenewalPrice(order, reseller) {
  if (order.price && order.price > 0) {
    return Math.ceil(Number(order.price));
  }

  if (order.ipStockId && order.memory && reseller) {
    const stock = await IPStock.findById(order.ipStockId);
    if (stock) {
      const base = await getCurrentListPriceForOrder(order);
      const memOption = stock.memoryOptions?.get?.(order.memory);
      const basePrice = base || memOption?.price;
      if (basePrice) {
        return calculateResellerPlanPrice(reseller, String(stock._id), order.memory, basePrice);
      }
    }
  }

  return Math.ceil(Number(order.price) || 0);
}

async function runProviderRenewal(order, orderId, provider) {
  let providerRenewalResult = null;
  let providerRenewalSuccess = false;

  if (provider === 'hostycare' && order.hostycareServiceId) {
    try {
      const api = new HostycareAPI();
      providerRenewalResult = await api.renewService(order.hostycareServiceId);
      providerRenewalSuccess = true;
    } catch (err) {
      providerRenewalResult = { error: err.message };
    }
  } else if (provider === 'smartvps') {
    const serviceIdentifier = order.smartvpsServiceId || order.ipAddress;
    if (serviceIdentifier) {
      try {
        const api = new SmartVpsAPI();
        providerRenewalResult = await api.renewVps(serviceIdentifier);
        providerRenewalSuccess = true;
      } catch (err) {
        providerRenewalResult = { error: err.message };
      }
    } else {
      providerRenewalResult = { error: 'Missing SmartVPS service identifier' };
    }
  } else if (provider === 'advps') {
    try {
      const api = new AdvpsAPI();
      const advpsRenew = await executeAdvpsUpstreamRenewal(api, order, { Order });
      providerRenewalResult = advpsRenew.result || { error: advpsRenew.error };
      providerRenewalSuccess = advpsRenew.success;
      if (advpsRenew.correctedServiceId) {
        await Order.findByIdAndUpdate(orderId, { advpsServiceId: advpsRenew.correctedServiceId });
        order.advpsServiceId = advpsRenew.correctedServiceId;
      }
    } catch (err) {
      providerRenewalResult = { error: err.message };
    }
  } else {
    providerRenewalSuccess = true;
  }

  return { providerRenewalResult, providerRenewalSuccess };
}

export async function renewResellerOrder(reseller, order, orderId) {
  if (isSlotIpOrder(order)) {
    return { ok: false, status: 400, body: { success: false, message: SLOT_IP_NO_RENEWAL_MESSAGE } };
  }

  if (!order.expiryDate) {
    return { ok: false, status: 400, body: { success: false, message: 'Order has no expiry date' } };
  }

  const diffDays = getDaysUntilExpiry(order.expiryDate);
  if (!isWithinRenewalWindow(order.expiryDate)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message:
          diffDays > RENEWAL_DAYS_BEFORE_EXPIRY
            ? `Renewal opens within ${RENEWAL_DAYS_BEFORE_EXPIRY} days of expiry.`
            : 'Service expired too long ago — contact support.',
      },
    };
  }

  const companyCheck = await detectCompanyManagedRenewal(order);
  if (companyCheck.isCompany) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'This product requires manual renewal approval. Contact OceanLinux admin.',
        code: 'COMPANY_MANUAL_RENEWAL',
      },
    };
  }

  const renewalPrice = await resolveResellerRenewalPrice(order, reseller);
  if (!renewalPrice || renewalPrice <= 0) {
    return { ok: false, status: 400, body: { success: false, message: 'Invalid renewal price' } };
  }

  const hasFunds = await ResellerWalletService.hasSufficientBalance(reseller._id, renewalPrice);
  if (!hasFunds) {
    return {
      ok: false,
      status: 402,
      body: { success: false, message: 'Insufficient wallet balance', required: renewalPrice },
    };
  }

  const provider = await resolveRenewalProvider(order);
  const currentExpiry = order.expiryDate;
  let newExpiryDate = calculateRenewalExpiryDate(currentExpiry);
  const renewalTxnId = `RESELLER_RENEW_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  try {
    await ResellerWalletService.deductForRenewal(
      reseller._id,
      renewalPrice,
      orderId,
      `Reseller API renewal ${orderId} — ${order.productName}`,
    );
  } catch (err) {
    return { ok: false, status: 402, body: { success: false, message: err.message } };
  }

  const { providerRenewalResult, providerRenewalSuccess } = await runProviderRenewal(order, orderId, provider);

  if (provider === 'advps' && providerRenewalSuccess && order.advpsServiceId) {
    try {
      const api = new AdvpsAPI();
      const statusRes = await api.status(order.advpsServiceId);
      const statusCreds = extractAdvpsStatusCredentials(statusRes, order);
      const advpsExpiry = pickAdvpsExpiryDate(statusCreds.expiryDate);
      if (advpsExpiry) newExpiryDate = advpsExpiry;
    } catch (_) { /* use calculated expiry */ }
  }

  const renewalPayment = {
    paymentId: renewalTxnId,
    amount: renewalPrice,
    paidAt: new Date(),
    previousExpiry: currentExpiry,
    newExpiry: newExpiryDate,
    renewalTxnId,
    provider,
    paymentMethod: 'reseller_wallet',
    providerRenewalResult,
    providerRenewalSuccess,
    paymentDetails: {
      method: 'reseller_wallet',
      resellerId: String(reseller._id),
      confirmedAt: new Date(),
    },
  };

  const updatedOrder = await Order.findByIdAndUpdate(
    orderId,
    {
      expiryDate: newExpiryDate,
      lastAction: 'renew',
      lastActionTime: new Date(),
      provider,
      $push: { renewalPayments: renewalPayment },
      $unset: { pendingRenewal: 1 },
    },
    { new: true },
  );

  notifyRenewalCompleted(updatedOrder, newExpiryDate, renewalTxnId).catch(() => {});

  const freshReseller = await Reseller.findById(reseller._id).lean();

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      message: providerRenewalSuccess
        ? 'Service renewed successfully'
        : 'Renewal paid — service period extended. Upstream renewal may retry automatically.',
      orderId,
      renewalTxnId,
      amount: renewalPrice,
      previousExpiry: currentExpiry,
      newExpiryDate,
      providerRenewalSuccess,
      walletBalance: freshReseller?.wallet?.balance ?? 0,
    },
  };
}
