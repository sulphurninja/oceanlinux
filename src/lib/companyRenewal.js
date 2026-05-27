import IPStock from '@/models/ipStockModel';

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
 * Returns { isCompany: boolean, companyId?: ObjectId }.
 */
export async function detectCompanyManagedRenewal(order) {
  if (!order) return { isCompany: false };
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
