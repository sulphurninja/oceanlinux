/**
 * Customer-facing provider label. Upstream backends (Netbay, etc.) are shown as OceanLinux.
 */
export function getCustomerProviderDisplayName(provider) {
  if (!provider) return 'OceanLinux';

  switch (String(provider).toLowerCase()) {
    case 'smartvps':
      return 'SmartVPS';
    case 'hostycare':
      return 'Hostycare';
    case 'oceanlinux':
    case 'slotip':
    case 'netbay':
      return 'OceanLinux';
    case 'advps':
      return 'ADVPS';
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

/** Infer provider key from an order row (dashboard lists). */
export function getCustomerProviderDisplayNameFromOrder(order) {
  if (!order) return 'OceanLinux';

  if (order.slotIpPackageId || order.provider === 'slotip') {
    return 'OceanLinux';
  }

  if (order.provider) {
    return getCustomerProviderDisplayName(order.provider);
  }

  if (order.netbayServiceId) return 'OceanLinux';
  if (order.advpsServiceId) return 'ADVPS';
  if (order.hostycareServiceId) return 'Hostycare';
  if (order.smartvpsServiceId) return 'SmartVPS';

  if (
    order.productName?.includes('103.195') ||
    order.ipAddress?.startsWith('103.195') ||
    order.productName?.includes('🏅')
  ) {
    return 'SmartVPS';
  }

  return 'OceanLinux';
}
