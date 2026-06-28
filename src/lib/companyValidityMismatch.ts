/**
 * Compare Hostheaven panel expiry (synced on inventory) vs customer validity
 * (company sale = 30 days, Feb = calendar days).
 */

import {
  calculateCompanyExpiryDate,
  getCompanyValidityDays,
  getDaysUntilExpiry,
} from '@/lib/expiryHelper';

export type CompanyInventoryItemLike = {
  _id: string;
  ipAddress: string;
  expiryDate?: string | Date | null;
  allocated?: boolean;
  orderId?: string | null;
  allocatedAt?: string | Date | null;
  addedAt?: string | Date | null;
};

export type CompanyStockLike = {
  _id: string;
  name: string;
  inventoryItems?: CompanyInventoryItemLike[];
};

export type CompanyOrderLike = {
  _id: string;
  expiryDate?: string | Date | null;
  createdAt?: string | Date | null;
  ipAddress?: string | null;
  stockName?: string;
  ipStockId?: string;
};

export type ValidityMismatchRow = {
  id: string;
  ipAddress: string;
  stockName: string;
  stockId: string;
  status: 'ready' | 'sold';
  panelExpiry: string;
  customerExpiry: string;
  panelDaysLeft: number;
  customerDaysLeft: number;
  customerDaysOnSale: number;
  gapDays: number;
  soldAt?: string | null;
  addedAt?: string | null;
};

function cleanIp(ip?: string | null) {
  return String(ip || '').split(':')[0].trim();
}

function dayKey(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calendarGapDays(later: Date, earlier: Date) {
  return Math.ceil((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function parsePanelExpiry(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** IP → panel expiry from inventory rows + optional Hostheaven sync map. */
export function buildPanelExpiryByIp(
  stocks: CompanyStockLike[],
  panelExpiryByIp?: Record<string, string | Date | null>
): Map<string, Date> {
  const map = new Map<string, Date>();

  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      const ip = cleanIp(item.ipAddress);
      const expiry = parsePanelExpiry(item.expiryDate);
      if (ip && expiry) map.set(ip, expiry);
    }
  }

  if (panelExpiryByIp) {
    for (const [rawIp, rawExpiry] of Object.entries(panelExpiryByIp)) {
      const ip = cleanIp(rawIp);
      const expiry = parsePanelExpiry(rawExpiry);
      if (ip && expiry && !map.has(ip)) map.set(ip, expiry);
    }
  }

  return map;
}

function pushMismatchRow(
  rows: ValidityMismatchRow[],
  seenIps: Set<string>,
  row: ValidityMismatchRow
) {
  const ip = cleanIp(row.ipAddress);
  if (!ip || seenIps.has(ip)) return;
  seenIps.add(ip);
  rows.push(row);
}

export function buildCompanyValidityMismatchReport(
  stocks: CompanyStockLike[],
  orders: CompanyOrderLike[],
  referenceDate = new Date(),
  panelExpiryByIp?: Record<string, string | Date | null>
): ValidityMismatchRow[] {
  const rows: ValidityMismatchRow[] = [];
  const seenIps = new Set<string>();
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  const panelByIp = buildPanelExpiryByIp(stocks, panelExpiryByIp);

  const stockById = new Map(stocks.map((s) => [String(s._id), s]));

  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      const ip = cleanIp(item.ipAddress);
      if (!ip) continue;

      const panelExpiry = panelByIp.get(ip) || parsePanelExpiry(item.expiryDate);
      if (!panelExpiry) continue;

      const panelDaysLeft = getDaysUntilExpiry(panelExpiry);

      const linkedOrder = item.orderId ? orderById.get(String(item.orderId)) : null;
      const orderByIp = orders.find((o) => cleanIp(o.ipAddress) === ip) || null;
      const soldOrder = linkedOrder || orderByIp;
      const isSold = !!item.allocated || !!soldOrder;

      if (!isSold) {
        const customerExpiry = calculateCompanyExpiryDate(referenceDate);
        const customerDaysOnSale = getCompanyValidityDays(referenceDate);

        if (panelExpiry.getTime() >= customerExpiry.getTime()) continue;

        pushMismatchRow(rows, seenIps, {
          id: `ready-${item._id}`,
          ipAddress: item.ipAddress,
          stockName: stock.name,
          stockId: stock._id,
          status: 'ready',
          panelExpiry: panelExpiry.toISOString(),
          customerExpiry: customerExpiry.toISOString(),
          panelDaysLeft,
          customerDaysLeft: getDaysUntilExpiry(customerExpiry),
          customerDaysOnSale,
          gapDays: calendarGapDays(customerExpiry, panelExpiry),
          addedAt: item.addedAt ? String(item.addedAt) : null,
        });
        continue;
      }

      const saleBase =
        item.allocatedAt ||
        soldOrder?.createdAt ||
        referenceDate;
      const saleDate = new Date(saleBase);
      if (Number.isNaN(saleDate.getTime())) continue;

      const customerExpiry = calculateCompanyExpiryDate(saleDate);
      if (panelExpiry.getTime() >= customerExpiry.getTime()) continue;

      pushMismatchRow(rows, seenIps, {
        id: `sold-${item._id}`,
        ipAddress: item.ipAddress,
        stockName: stock.name,
        stockId: stock._id,
        status: 'sold',
        panelExpiry: panelExpiry.toISOString(),
        customerExpiry: customerExpiry.toISOString(),
        panelDaysLeft,
        customerDaysLeft: getDaysUntilExpiry(customerExpiry),
        customerDaysOnSale: getCompanyValidityDays(saleDate),
        gapDays: calendarGapDays(customerExpiry, panelExpiry),
        soldAt: saleDate.toISOString(),
        addedAt: item.addedAt ? String(item.addedAt) : null,
      });
    }
  }

  // Sold orders with IP — even if not linked in inventory (manual assign / old VPS).
  for (const order of orders) {
    const ip = cleanIp(order.ipAddress);
    if (!ip) continue;

    const panelExpiry = panelByIp.get(ip);
    if (!panelExpiry) continue;

    const saleDate = new Date(order.createdAt || referenceDate);
    if (Number.isNaN(saleDate.getTime())) continue;

    const customerExpiry = calculateCompanyExpiryDate(saleDate);
    if (panelExpiry.getTime() >= customerExpiry.getTime()) continue;

    const stock = order.ipStockId ? stockById.get(String(order.ipStockId)) : null;

    pushMismatchRow(rows, seenIps, {
      id: `order-${order._id}`,
      ipAddress: ip,
      stockName: order.stockName || stock?.name || 'Order',
      stockId: stock?._id || String(order.ipStockId || ''),
      status: 'sold',
      panelExpiry: panelExpiry.toISOString(),
      customerExpiry: customerExpiry.toISOString(),
      panelDaysLeft: getDaysUntilExpiry(panelExpiry),
      customerDaysLeft: getDaysUntilExpiry(customerExpiry),
      customerDaysOnSale: getCompanyValidityDays(saleDate),
      gapDays: calendarGapDays(customerExpiry, panelExpiry),
      soldAt: saleDate.toISOString(),
    });
  }

  return rows.sort((a, b) => a.panelDaysLeft - b.panelDaysLeft);
}

export type CompanyInventoryActivity = {
  addedToday: number;
  soldToday: number;
  readyCount: number;
  soldCount: number;
  mismatchCount: number;
  recentSoldByDay: Array<{ label: string; count: number }>;
};

function isSameCalendarDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function buildCompanyInventoryActivity(
  stocks: CompanyStockLike[],
  mismatchCount: number,
  referenceDate = new Date()
): CompanyInventoryActivity {
  let addedToday = 0;
  let soldToday = 0;
  let readyCount = 0;
  let soldCount = 0;
  const soldByDay = new Map<string, { label: string; count: number; ts: number }>();

  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      if (item.allocated) {
        soldCount++;
        const soldAt = item.allocatedAt ? new Date(item.allocatedAt) : null;
        if (soldAt && !Number.isNaN(soldAt.getTime())) {
          if (isSameCalendarDay(soldAt, referenceDate)) soldToday++;
          const key = soldAt.toISOString().slice(0, 10);
          const prev = soldByDay.get(key);
          soldByDay.set(key, {
            label: dayKey(soldAt),
            count: (prev?.count || 0) + 1,
            ts: soldAt.getTime(),
          });
        }
      } else {
        readyCount++;
      }

      if (item.addedAt) {
        const added = new Date(item.addedAt);
        if (!Number.isNaN(added.getTime()) && isSameCalendarDay(added, referenceDate)) {
          addedToday++;
        }
      }
    }
  }

  const recentSoldByDay = [...soldByDay.values()]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 7)
    .map(({ label, count }) => ({ label, count }));

  return {
    addedToday,
    soldToday,
    readyCount,
    soldCount,
    mismatchCount,
    recentSoldByDay,
  };
}
