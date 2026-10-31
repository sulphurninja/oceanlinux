/** Nexa dedicated-IP proxy. The provider has no renew API. */
export function isNexaOrder(order) {
  if (!order) return false;
  if (String(order.provider || '').toLowerCase() === 'nexa') return true;
  return !!String(order.nexaOrderId || '').trim();
}

export const NEXA_NO_RENEWAL_MESSAGE =
  'This proxy cannot be renewed. Please purchase a new package when it expires.';

/** Stock is a Nexa plan even if the order provider was not stamped yet. */
export async function nexaStockRenewalMessage(order) {
  if (!order?.ipStockId || isNexaOrder(order)) return '';
  try {
    const IPStock = require('@/models/ipStockModel');
    const { isNexaDedicatedIpStock } = require('@/lib/netbayGroupTags');
    const stock = await IPStock.findById(order.ipStockId).select('tags defaultConfigurations').lean();
    if (isNexaDedicatedIpStock(stock)) return NEXA_NO_RENEWAL_MESSAGE;
  } catch (err) {
    console.error('[nexa-renewal] stock lookup failed:', err?.message || err);
  }
  return '';
}
