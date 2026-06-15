import IPStock from '@/models/ipStockModel';
import { isSlotIpOrder } from '@/lib/slotIpOrder';

/**
 * Detect whether an order's renewal must be routed through the company
 * approval queue rather than executed automatically.
 *
 * Rule: if the order has no native upstream automation (no hostycare /
 * smartvps / advps service id) AND its IPStock is linked to a Company,
 * the renewal needs that company's approval before expiry is extended.
 *
 * Hostycare / SmartVPS / ADVPS orders with real service IDs keep the
 * existing automated path even if their stock happens to belong to a
 * company — the upstream system handles the actual extension.
 *
 * Slot IP orders are one-time purchases and never use company renewal.
 *
 * Returns { isCompany: boolean, companyId?: ObjectId }.
 */
export async function detectCompanyManagedRenewal(order) {
  if (!order) return { isCompany: false };
  if (isSlotIpOrder(order)) return { isCompany: false };
  if (order.hostycareServiceId) return { isCompany: false };
  if (order.smartvpsServiceId) return { isCompany: false };
  if (order.advpsServiceId) return { isCompany: false };
  if (!order.ipStockId) return { isCompany: false };

  const ipStock = await IPStock.findById(order.ipStockId)
    .select('company name')
    .lean();
  if (!ipStock?.company) return { isCompany: false };

  return {
    isCompany: true,
    companyId: ipStock.company,
    stockName: ipStock.name || '',
  };
}

/** True when the order is fulfilled via a native upstream API (not company-manual). */
export function orderHasUpstreamAutomation(order) {
  if (!order) return false;
  return !!(order.hostycareServiceId || order.smartvpsServiceId || order.advpsServiceId);
}

/**
 * Renewal provider routing. Company-linked manual orders must stay on the
 * `oceanlinux` path (company approval queue) — never infer SmartVPS from the
 * generic "ocean linux" ipStock tag used on partner stocks.
 */
export async function resolveRenewalProvider(order) {
  if (!order) return 'oceanlinux';

  if (order.provider === 'advps' || order.advpsServiceId) return 'advps';
  if (order.hostycareServiceId) return 'hostycare';
  if (order.smartvpsServiceId || order.provider === 'smartvps') return 'smartvps';

  if (order.ipStockId) {
    const ipStock = await IPStock.findById(order.ipStockId).select('company tags').lean();
    if (ipStock) {
      if (ipStock.company && !orderHasUpstreamAutomation(order)) {
        return 'oceanlinux';
      }
      const tagsLower = ipStock.tags?.map((t) => t.toLowerCase()) || [];
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
