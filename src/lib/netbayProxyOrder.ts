/** Client-safe helpers for Netbay HTTP proxy orders (Premium IP / Dynamic Multi-IP). */

export type NetbayProxyOrderLike = {
  netbayProductKind?: string;
  netbayServiceId?: string;
  provider?: string;
  slotIpPackageId?: string;
};

export type NetbayProxyStockLike = {
  serverType?: string;
  companyAutomation?: { provider?: string; enabled?: boolean } | null;
  tags?: string[];
  defaultConfigurations?: Record<string, unknown> | null;
};

export function isNetbayProxyIpStock(stock: NetbayProxyStockLike | null | undefined): boolean {
  if (!stock) return false;
  const st = String(stock.serverType || '').trim().toLowerCase();
  if (st !== 'proxy') return false;
  if (stock.companyAutomation?.enabled && stock.companyAutomation.provider === 'netbay') {
    return true;
  }
  const tags = (stock.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes('netbay')) return true;
  const cfg = stock.defaultConfigurations as { netbay?: unknown } | undefined;
  return !!cfg?.netbay || st === 'proxy';
}

/** True for Netbay-backed proxy stock orders — not manual Slot IP packages. */
export function isNetbayProxyOrder(
  order: NetbayProxyOrderLike | null | undefined,
  stock?: NetbayProxyStockLike | null
): boolean {
  if (!order) return false;
  if (order.slotIpPackageId || order.provider === 'slotip') return false;
  if (String(order.netbayProductKind || '').toLowerCase() === 'proxy') return true;
  return isNetbayProxyIpStock(stock);
}

/** Manage System (sync/renew) available for Netbay proxy when provisioned or company Netbay is linked. */
export function isNetbayProxyManageAvailable(
  order: NetbayProxyOrderLike | null | undefined,
  stock?: NetbayProxyStockLike | null
): boolean {
  if (!isNetbayProxyOrder(order, stock)) return false;
  if (order?.netbayServiceId) return true;
  if (stock?.companyAutomation?.enabled && stock.companyAutomation.provider === 'netbay') {
    return true;
  }
  return order?.provider === 'netbay';
}
