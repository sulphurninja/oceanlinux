/**
 * Reseller order renewal — wallet deduct + upstream provider renew + expiry extend.
 */

import Order from '@/models/orderModel';
import Reseller from '@/models/resellerModel';
import ResellerWalletService from '@/services/resellerWalletService';
import { resolveOrderRenewalExpiryDate, getDaysUntilExpiryIST, isWithinRenewalWindow, RENEWAL_DAYS_BEFORE_EXPIRY } from '@/lib/expiryHelper';
import { resolveRenewalProvider, detectCompanyManagedRenewal, shouldUseCompanyValidityForRenewal } from '@/lib/companyRenewal';
import { renewalBlockMessage } from '@/lib/trialVpsOrder';
import { calculateResellerPlanPrice } from '@/lib/resellerOrderApi';
import { getCurrentListPriceForOrder } from '@/lib/orderRenewalPricingServer';
import IPStock from '@/models/ipStockModel';
import { notifyRenewalCompleted } from '@/lib/renewalNotifications';

const HostycareAPI = require('@/services/hostycareApi');
const SmartVpsAPI = require('@/services/smartvpsApi');
const AdvpsAPI = require('@/services/advpsApi');
const { executeAdvpsUpstreamRenewal } = require('@/lib/advpsRenewal');
const { executeNetbayUpstreamRenewal } = require('@/lib/netbayRenewal');
const { executeResellerPanelUpstreamRenewal } = require('@/lib/resellerPanelRenewal');
const { resolveRenewalExpiryFromPanel } = require('@/lib/companyResellerInventorySync');
const { pickAdvpsExpiryDate } = require('@/lib/advpsOrderExpiry');
const { extractAdvpsStatusCredentials } = require('@/lib/advpsStatusNormalize');
const RenewalLogger = require('@/services/renewalLogger');

async function resolveResellerRenewalPrice(order, reseller) {
  // Always use current reseller API rate (custom price / markup), same as new orders.
  // Do not charge order.price — that may be an old list rate stored at purchase time.
  if (order.ipStockId && order.memory && reseller) {
    const stock = await IPStock.findById(order.ipStockId);
    if (stock) {
      const base = await getCurrentListPriceForOrder(order);
      const { resolveNetbayBillingMemory } = require('@/lib/netbayGroupTags');
      const billingMemory = resolveNetbayBillingMemory(stock, order.memory) || order.memory;
      const memOption = stock.memoryOptions?.get?.(billingMemory);
      const basePrice = base || memOption?.price;
      if (basePrice) {
        return calculateResellerPlanPrice(reseller, String(stock._id), order.memory, basePrice, {
          fallbackMemoryKeys: [billingMemory, '4GB', 'proxy', 'slot'],
        });
      }
    }
  }

  if (order.price && order.price > 0) {
    return Math.ceil(Number(order.price));
  }

  return Math.ceil(Number(order.price) || 0);
}

async function runProviderRenewal(order, orderId, provider) {
  let providerRenewalResult = null;
  let providerRenewalSuccess = false;
  let providerNewExpiryDate = null;

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
  } else if (provider === 'netbay') {
    try {
      const netbayRenew = await executeNetbayUpstreamRenewal(order, { months: 1 });
      providerRenewalResult = netbayRenew.result || { error: netbayRenew.error };
      providerRenewalSuccess = netbayRenew.success;
    } catch (err) {
      providerRenewalResult = { error: err.message };
    }
  } else if (provider === 'reseller-api') {
    try {
      const panelRenew = await executeResellerPanelUpstreamRenewal(order, { months: 1, Order });
      providerRenewalResult = panelRenew.result || { error: panelRenew.error };
      providerRenewalSuccess = panelRenew.success;
      if (panelRenew.success && panelRenew.newExpiryDate) {
        providerNewExpiryDate = panelRenew.newExpiryDate;
      }
    } catch (err) {
      providerRenewalResult = { error: err.message };
    }
  } else {
    providerRenewalSuccess = true;
  }

  return { providerRenewalResult, providerRenewalSuccess, providerNewExpiryDate };
}

export async function renewResellerOrder(reseller, order, orderId) {
  const renewalTxnId = `RESELLER_RENEW_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const logger = new RenewalLogger(order, renewalTxnId, 'reseller-api', {
    resellerId: String(reseller._id),
    resellerEmail: reseller.email || '',
    businessName: reseller.businessName || '',
  });

  const failEarly = async (status, body, errorMessage) => {
    logger.logError(errorMessage || body.message, body);
    await logger.finalize(false, null, errorMessage || body.message);
    return { ok: false, status, body };
  };

  const renewBlock = await renewalBlockMessage(order);
  if (renewBlock) {
    return failEarly(400, { success: false, message: renewBlock }, renewBlock);
  }

  if (!order.expiryDate) {
    return failEarly(400, { success: false, message: 'Order has no expiry date' }, 'Order has no expiry date');
  }

  const diffDays = getDaysUntilExpiryIST(order.expiryDate);
  if (!isWithinRenewalWindow(order.expiryDate)) {
    const message =
      diffDays > RENEWAL_DAYS_BEFORE_EXPIRY
        ? `Renewal opens within ${RENEWAL_DAYS_BEFORE_EXPIRY} days of expiry.`
        : 'This VPS has expired. Renewal is no longer available.';
    return failEarly(400, { success: false, message }, message);
  }

  const companyCheck = await detectCompanyManagedRenewal(order);
  if (companyCheck.isCompany) {
    return failEarly(
      400,
      {
        success: false,
        message: 'This product requires manual renewal approval. Contact OceanLinux admin.',
        code: 'COMPANY_MANUAL_RENEWAL',
      },
      'Company-managed renewal not allowed via reseller API',
    );
  }

  const renewalPrice = await resolveResellerRenewalPrice(order, reseller);
  if (!renewalPrice || renewalPrice <= 0) {
    return failEarly(400, { success: false, message: 'Invalid renewal price' }, 'Invalid renewal price');
  }

  logger.logInfo('Reseller renewal price resolved', { renewalPrice, resellerId: String(reseller._id) });

  const hasFunds = await ResellerWalletService.hasSufficientBalance(reseller._id, renewalPrice);
  if (!hasFunds) {
    return failEarly(
      402,
      { success: false, message: 'Insufficient wallet balance', required: renewalPrice },
      'Insufficient wallet balance',
    );
  }

  const provider = await resolveRenewalProvider(order);
  const currentExpiry = order.expiryDate;
  const useCompanyValidity = shouldUseCompanyValidityForRenewal(companyCheck, provider);
  let newExpiryDate = resolveOrderRenewalExpiryDate(currentExpiry, { useCompanyValidity });

  logger.logInfo('Provider determined', { provider });

  if (provider === 'smartvps' || provider === 'reseller-api') {
    const { checkRenewalPanelPresence } = require('@/lib/renewalPanelPresence');
    const presence = await checkRenewalPanelPresence(order, provider);
    if (!presence.ok) {
      logger.logInfo('Renewal blocked, IP not on provider panel', { code: presence.code, provider });
      return failEarly(400, { success: false, message: presence.message }, presence.message);
    }
  }

  logger.setPaymentInfo('reseller_wallet', renewalTxnId, renewalPrice, renewalTxnId);

  try {
    await ResellerWalletService.deductForRenewal(
      reseller._id,
      renewalPrice,
      orderId,
      `Reseller API renewal ${orderId} — ${order.productName}`,
    );
    logger.logSuccess('Reseller wallet debited', { amount: renewalPrice, renewalTxnId });
  } catch (err) {
    logger.logError('Wallet deduction failed', err);
    await logger.finalize(false, null, err.message);
    return { ok: false, status: 402, body: { success: false, message: err.message } };
  }

  const providerStart = Date.now();
  const { providerRenewalResult, providerRenewalSuccess, providerNewExpiryDate } =
    await runProviderRenewal(order, orderId, provider);
  const providerDuration = Date.now() - providerStart;

  if (providerRenewalSuccess) {
    logger.setProviderApiResult(provider, true, providerRenewalResult, null, providerDuration);
  } else {
    logger.setProviderApiResult(
      provider,
      false,
      providerRenewalResult,
      { message: providerRenewalResult?.error || 'Upstream renewal failed' },
      providerDuration,
    );
  }

  if (provider === 'reseller-api' && providerRenewalSuccess && providerNewExpiryDate) {
    newExpiryDate = providerNewExpiryDate;
  }

  if (provider === 'reseller-api') {
    newExpiryDate = await resolveRenewalExpiryFromPanel(order, newExpiryDate, {
      panelRenew: {
        success: providerRenewalSuccess,
        newExpiryDate: providerNewExpiryDate,
      },
    });
  }

  if (provider === 'advps' && providerRenewalSuccess && order.advpsServiceId) {
    try {
      const api = new AdvpsAPI();
      const statusRes = await api.status(order.advpsServiceId);
      const statusCreds = extractAdvpsStatusCredentials(statusRes, order);
      const advpsExpiry = pickAdvpsExpiryDate(statusCreds.expiryDate);
      if (advpsExpiry) newExpiryDate = advpsExpiry;
    } catch (_) { /* use calculated expiry */ }
  }

  if (provider === 'netbay' && providerRenewalSuccess && providerRenewalResult?.data?.newExpiryDate) {
    const netbayExpiry = new Date(providerRenewalResult.data.newExpiryDate);
    if (!Number.isNaN(netbayExpiry.getTime())) newExpiryDate = netbayExpiry;
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

  await logger.finalize(true, newExpiryDate);

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
