function filled(value) {
  return value != null && String(value).trim() !== '';
}

function companyLabel(order) {
  const fromStock = String(order?.providerCompanyName || '').trim();
  if (fromStock) return fromStock;
  return String(order?.companyAutomation?.companyName || '').trim();
}

/**
 * Provider label. A company order uses the name from Admin → Companies
 * (Oceanlinux-N, Host Heaven, Oceanlinux-P). advps, smartvps, netbay,
 * trial and slot are only for orders that are not tied to a company.
 */
export function getProviderDisplayLabel(order) {
  if (!order) return '';

  const company = companyLabel(order);
  if (company) return company;

  const provider = String(order.provider || '').toLowerCase();

  if (filled(order.slotIpPackageId) || provider === 'slotip') return 'slot';
  if (filled(order.trialVpsPackageId) || provider === 'trialvps') return 'trial';

  if (provider === 'advps' || filled(order.advpsServiceId)) return 'advps';
  if (provider === 'smartvps' || filled(order.smartvpsServiceId)) return 'smartvps';
  if (
    provider === 'netbay' ||
    filled(order.netbayServiceId) ||
    String(order.netbayProductKind || '').toLowerCase() === 'proxy'
  ) {
    return 'netbay';
  }

  return '';
}

/** @deprecated string-only callers. Prefer getProviderDisplayLabel(order). */
export function getCustomerProviderDisplayName(provider) {
  return getProviderDisplayLabel({ provider }) || '';
}

export function getAdminProviderDisplayName(provider, order) {
  return getProviderDisplayLabel({ ...(order || {}), provider: provider || order?.provider }) || '—';
}

export function getAdminProviderDisplayNameFromOrder(order) {
  if (!order) return '—';
  return getProviderDisplayLabel(order) || '—';
}

export function getCustomerProviderDisplayNameFromOrder(order) {
  if (!order) return '—';
  return getProviderDisplayLabel(order) || '—';
}
