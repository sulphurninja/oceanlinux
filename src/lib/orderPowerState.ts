import { isNonRenewablePackageOrder, isTrialVpsPanelManageOrder } from '@/lib/trialVpsOrder';

export type PowerState = 'running' | 'stopped' | 'suspended' | 'busy' | 'unknown';

export type IPStockLike = {
  tags?: string[];
  companyAutomation?: {
    provider: 'virtualizor' | 'reseller-api' | 'netbay' | 'kurohost' | 'joy' | 'hostdzire' | 'rackato' | 'nexa';
    enabled: boolean;
  } | null;
};

export type OrderPowerLike = {
  _id?: string;
  provider?: string;
  hostycareServiceId?: string;
  smartvpsServiceId?: string;
  advpsServiceId?: string;
  netbayServiceId?: string;
  kurohostInstanceId?: string;
  ipAddress?: string;
  ipStockId?: string;
  slotIpPackageId?: string;
  trialVpsPackageId?: string;
  trialVpsPanelManage?: boolean;
  netbayProductKind?: string;
  productName?: string;
  status?: string;
  provisioningStatus?: string;
};

export function getProviderFromOrder(
  order: OrderPowerLike,
  ipStock: IPStockLike | null
): 'hostycare' | 'smartvps' | 'oceanlinux' | 'advps' | 'netbay' | 'kurohost' {
  if (isNonRenewablePackageOrder(order) && !isTrialVpsPanelManageOrder(order)) return 'oceanlinux';

  if (String(order.netbayProductKind || '').toLowerCase() === 'proxy') return 'netbay';

  if (order.provider === 'netbay') return 'netbay';
  if (order.provider === 'kurohost') return 'kurohost';
  if (order.provider === 'advps') return 'advps';
  if (order.provider === 'smartvps') return 'smartvps';

  if (order.netbayServiceId) return 'netbay';
  if (order.kurohostInstanceId) return 'kurohost';
  if (order.advpsServiceId) return 'advps';
  if (order.hostycareServiceId) return 'hostycare';
  if (order.smartvpsServiceId) return 'smartvps';

  if (ipStock?.tags) {
    const tagsLower = ipStock.tags.map((t) => t.toLowerCase());
    if (tagsLower.includes('netbay')) return 'netbay';
    if (tagsLower.includes('kurohost')) return 'kurohost';
    if (tagsLower.includes('advps') || tagsLower.includes('flex')) return 'advps';
    if (tagsLower.includes('smartvps') || tagsLower.includes('ocean linux')) return 'smartvps';
  }

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

export function hasCompanyAnyAutomation(stock: IPStockLike | null): boolean {
  return !!(
    stock?.companyAutomation?.enabled &&
    (stock.companyAutomation.provider === 'virtualizor' ||
      stock.companyAutomation.provider === 'reseller-api' ||
      stock.companyAutomation.provider === 'netbay' ||
      stock.companyAutomation.provider === 'kurohost' ||
      stock.companyAutomation.provider === 'joy' ||
      stock.companyAutomation.provider === 'hostdzire' ||
      stock.companyAutomation.provider === 'rackato' ||
      stock.companyAutomation.provider === 'nexa')
  );
}

export function isOrderCompanyAutomated(
  order: OrderPowerLike | null,
  stock: IPStockLike | null
): boolean {
  if (!order || !hasCompanyAnyAutomation(stock)) return false;

  const prov = getProviderFromOrder(order, stock);
  if (prov === 'oceanlinux') return true;

  const hasNativeServiceId =
    (prov === 'hostycare' && !!order.hostycareServiceId) ||
    (prov === 'smartvps' && !!(order.smartvpsServiceId || order.ipAddress)) ||
    (prov === 'advps' && !!order.advpsServiceId) ||
    (prov === 'netbay' && !!order.netbayServiceId) ||
    (prov === 'kurohost' && !!order.kurohostInstanceId);

  return !hasNativeServiceId;
}

/** True when live VPS power status can be fetched (same rules as order manage page). */
export function canShowLivePowerState(
  order: OrderPowerLike,
  ipStock: IPStockLike | null
): boolean {
  if (isNonRenewablePackageOrder(order) && !isTrialVpsPanelManageOrder(order)) return false;
  if (String(order.netbayProductKind || '').toLowerCase() === 'proxy') return false;

  const provider = getProviderFromOrder(order, ipStock);
  const hasAssignedIp = !!(order.ipAddress || '').trim();
  const currentStatus = (order.provisioningStatus || order.status || '').toLowerCase();
  const companyAutomated = isOrderCompanyAutomated(order, ipStock);

  const isActiveStatus =
    (order.status || '').toLowerCase() === 'completed' ||
    currentStatus === 'active' ||
    (companyAutomated && hasAssignedIp) ||
    hasAssignedIp;

  const hasPowerApi =
    (provider === 'hostycare' && !!order.hostycareServiceId) ||
    (provider === 'smartvps' && !!(order.smartvpsServiceId || order.ipAddress)) ||
    (provider === 'advps' && !!order.advpsServiceId) ||
    (provider === 'netbay' && !!order.netbayServiceId) ||
    (provider === 'kurohost' && !!order.kurohostInstanceId) ||
    (companyAutomated && hasAssignedIp);

  return hasPowerApi && isActiveStatus;
}

/** Only oceanlinux / company-automation orders need an ipStock lookup. */
export function orderNeedsIpStockForPowerState(order: OrderPowerLike): boolean {
  if (!order.ipStockId) return false;
  if (isNonRenewablePackageOrder(order) && !isTrialVpsPanelManageOrder(order)) return false;
  if (order.hostycareServiceId || order.smartvpsServiceId || order.advpsServiceId || order.netbayServiceId || order.kurohostInstanceId) {
    return false;
  }
  return true;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  limit = 4
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function fetchPowerStatesForOrders(
  orders: OrderPowerLike[],
  stocks: Record<string, IPStockLike>,
  onUpdate: (orderId: string, state: PowerState) => void,
  onStart?: (orderIds: string[]) => void
): Promise<void> {
  const eligible = orders.filter((order) =>
    canShowLivePowerState(order, stocks[order.ipStockId || ''] || null)
  );

  if (eligible.length === 0) return;

  onStart?.(eligible.map((order) => order._id!));

  await runWithConcurrency(eligible, async (order) => {
    const stock = stocks[order.ipStockId || ''] || null;
    const provider = getProviderFromOrder(order, stock);
    const orderId = (order as { _id?: string })._id;
    if (!orderId) return;
    try {
      const state = await fetchOrderPowerState(orderId, provider);
      onUpdate(orderId, state);
    } catch {
      onUpdate(orderId, 'unknown');
    }
  });
}

export function getPowerStatusEndpoint(
  provider: ReturnType<typeof getProviderFromOrder>
): 'smartvps-action' | 'advps-action' | 'service-action' {
  if (provider === 'smartvps') return 'smartvps-action';
  if (provider === 'advps') return 'advps-action';
  return 'service-action';
}

export async function fetchOrderPowerState(
  orderId: string,
  provider: ReturnType<typeof getProviderFromOrder>
): Promise<PowerState> {
  const endpoint = getPowerStatusEndpoint(provider);
  const res = await fetch(`/api/orders/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, action: 'status' }),
  });
  const data = await res.json();
  const state = data?.powerState;
  if (
    state === 'running' ||
    state === 'stopped' ||
    state === 'suspended' ||
    state === 'busy'
  ) {
    return state;
  }
  return 'unknown';
}
