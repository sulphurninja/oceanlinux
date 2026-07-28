import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { isSlotIpOrder } from '@/lib/slotIpOrder';
import { getCompanyResellerApiConfig } from '@/lib/companyResellerApi';
import { stockHasResellerPanelPlans } from '@/lib/ipStockAvailability';
import { looksLikeIpv4 } from '@/lib/companyInventory';

/**
 * Hostheaven / PrimeVPS panel renew — customer pays on OceanLinux, we renew
 * on the company reseller panel automatically (by VM id or IP lookup).
 */
export function stockUsesHostheavenResellerApi(ipStock) {
  if (!ipStock) return false;
  if (stockHasResellerPanelPlans(ipStock)) return true;
  const tags = (ipStock.tags || []).map((t) => String(t).toLowerCase());
  return tags.some((t) =>
    t.includes('reseller-api') || t.includes('primevps') || t.includes('primevm') || t.includes('advance')
  );
}

/**
 * True when this order should skip the company approval queue and renew
 * directly on Hostheaven when the customer pays.
 */
export async function isHostheavenDirectRenewEligible(order, ipStock = null) {
  if (!order || isSlotIpOrder(order)) return false;
  if (order.kurohostInstanceId || order.provider === 'kurohost') return false;
  if (order.netbayServiceId && order.provider === 'netbay') return false;
  if (order.resellerVmId || order.provider === 'reseller-api') return true;

  if (!order.ipStockId) return false;

  const stock =
    ipStock ||
    (await IPStock.findById(order.ipStockId).select('company tags defaultConfigurations name').lean());
  if (!stock?.company) return false;
  if (!stockUsesHostheavenResellerApi(stock)) return false;

  const company = await Company.findById(stock.company).select('resellerApi kurohostApi').lean();
  if (!getCompanyResellerApiConfig(company)) return false;

  const ip = String(order.ipAddress || '').split(':')[0].trim();
  return ip.length > 0;
}

/**
 * True when approving a queued company renewal should also renew on the
 * Hostheaven / reseller panel (lookup VM by IP if resellerVmId is missing).
 */
export function canRenewHostheavenPanelOnCompanyApprove(order, companyDoc) {
  if (!order || isSlotIpOrder(order)) return false;
  if (order.kurohostInstanceId || order.provider === 'kurohost') return false;
  if (order.netbayServiceId && order.provider === 'netbay') return false;
  if (!getCompanyResellerApiConfig(companyDoc)) return false;

  const ip = String(order.ipAddress || '').split(':')[0].trim();
  return ip.length > 0 && looksLikeIpv4(ip);
}

/**
 * Detect whether an order's renewal must be routed through the company
 * approval queue rather than executed automatically.
 *
 * Hostheaven (reseller panel) renewals are automatic — customer pays, panel
 * extends via wallet, order expiry updates. No /company → Renewals approval.
 *
 * KuroHost and pure manual company inventory (no Hostheaven panel) still use
 * the approval queue.
 */
export async function detectCompanyManagedRenewal(order) {
  if (!order) return { isCompany: false };
  if (isSlotIpOrder(order)) return { isCompany: false };
  if (order.hostycareServiceId) return { isCompany: false };
  if (order.smartvpsServiceId) return { isCompany: false };
  if (order.advpsServiceId) return { isCompany: false };
  if (order.netbayServiceId) return { isCompany: false };
  if (order.resellerVmId) return { isCompany: false };
  if (!order.ipStockId) return { isCompany: false };

  const ipStock = await IPStock.findById(order.ipStockId)
    .select('company name tags defaultConfigurations')
    .lean();
  if (!ipStock?.company) return { isCompany: false };

  if (await isHostheavenDirectRenewEligible(order, ipStock)) {
    return {
      isCompany: false,
      hostheavenAutoRenew: true,
      companyId: ipStock.company,
      stockName: ipStock.name || '',
    };
  }

  return {
    isCompany: true,
    companyId: ipStock.company,
    stockName: ipStock.name || '',
  };
}

/** True when the order is fulfilled via a native upstream API (not company-manual). */
export function orderHasUpstreamAutomation(order) {
  if (!order) return false;
  return !!(
    order.hostycareServiceId ||
    order.smartvpsServiceId ||
    order.advpsServiceId ||
    order.netbayServiceId ||
    order.resellerVmId
  );
}

/**
 * Renewal provider routing. Hostheaven company stocks use reseller-api renew
 * even when resellerVmId is not saved yet (lookup by IP on panel).
 */
export async function resolveRenewalProvider(order) {
  if (!order) return 'oceanlinux';

  if (order.provider === 'advps' || order.advpsServiceId) return 'advps';
  if (order.provider === 'netbay' || order.netbayServiceId) return 'netbay';
  if (order.provider === 'reseller-api' || order.resellerVmId) return 'reseller-api';
  if (order.hostycareServiceId) return 'hostycare';
  if (order.smartvpsServiceId || order.provider === 'smartvps') return 'smartvps';

  if (order.ipStockId) {
    const ipStock = await IPStock.findById(order.ipStockId)
      .select('company tags defaultConfigurations name')
      .lean();
    if (ipStock) {
      if (await isHostheavenDirectRenewEligible(order, ipStock)) {
        return 'reseller-api';
      }

      if (ipStock.company && !orderHasUpstreamAutomation(order)) {
        return 'oceanlinux';
      }
      const tagsLower = ipStock.tags?.map((t) => t.toLowerCase()) || [];
      if (tagsLower.includes('reseller-api') || tagsLower.includes('primevps') || tagsLower.includes('primevm')) {
        return 'reseller-api';
      }
      if (tagsLower.includes('smartvps') || tagsLower.includes('ocean linux')) {
        return 'smartvps';
      }
    }
  }

  if (
    order.productName?.includes('🌊') ||
    order.productName?.includes('103.195') ||
    order.ipAddress?.startsWith('103.195') ||
    order.productName?.includes('🏅')
  ) {
    return 'smartvps';
  }

  return 'oceanlinux';
}

/**
 * Hostheaven / company IP stock renewals always use 30-day validity (Feb = calendar days),
 * not calendar-month length (which adds 31 days in Jul/Aug/…).
 */
export function shouldUseCompanyValidityForRenewal(companyCheck, provider) {
  if (companyCheck?.hostheavenAutoRenew) return true;
  if (companyCheck?.isCompany) return true;
  if (provider === 'reseller-api') return true;
  return false;
}
