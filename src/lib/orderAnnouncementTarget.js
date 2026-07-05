import { isSlotIpOrder } from '@/lib/slotIpOrder';

/**
 * Resolve upstream provider for an order (mirrors dashboard order page logic).
 * Service IDs win over the stored `provider` field — many ADVPS orders still
 * carry the schema default provider value `hostycare` until explicitly updated.
 */
export function resolveProviderFromOrder(order, ipStock = null) {
  if (!order) return 'oceanlinux';
  if (isSlotIpOrder(order)) return 'oceanlinux';

  if (order.provider === 'netbay') return 'netbay';
  if (order.provider === 'reseller-api') return 'reseller-api';
  if (order.provider === 'advps') return 'advps';
  if (order.provider === 'smartvps') return 'smartvps';

  if (order.netbayServiceId) return 'netbay';
  if (order.resellerVmId) return 'reseller-api';
  if (order.advpsServiceId) return 'advps';
  if (order.hostycareServiceId) return 'hostycare';
  if (order.smartvpsServiceId) return 'smartvps';

  if (order.provider === 'hostycare') return 'hostycare';

  const tags = (ipStock?.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes('netbay')) return 'netbay';
  if (tags.includes('reseller-api') || tags.includes('primevps') || tags.includes('primevm')) return 'reseller-api';
  if (tags.includes('advps') || tags.includes('flex')) return 'advps';
  if (tags.includes('smartvps') || tags.includes('ocean linux')) return 'smartvps';

  if (order.productName?.includes('⚡')) return 'advps';
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

export function resolveCompanyIdFromIpStock(ipStock) {
  if (!ipStock?.company) return null;
  const company = ipStock.company;
  return String(company._id || company);
}
