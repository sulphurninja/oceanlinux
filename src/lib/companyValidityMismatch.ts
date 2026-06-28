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

function dayKey(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calendarGapDays(later: Date, earlier: Date) {
  return Math.ceil((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildCompanyValidityMismatchReport(
  stocks: CompanyStockLike[],
  orders: CompanyOrderLike[],
  referenceDate = new Date()
): ValidityMismatchRow[] {
  const rows: ValidityMismatchRow[] = [];
  const orderById = new Map(orders.map((o) => [String(o._id), o]));

  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      if (!item.expiryDate) continue;

      const panelExpiry = new Date(item.expiryDate);
      if (Number.isNaN(panelExpiry.getTime())) continue;

      const panelDaysLeft = getDaysUntilExpiry(panelExpiry);

      if (!item.allocated) {
        const customerExpiry = calculateCompanyExpiryDate(referenceDate);
        const customerDaysOnSale = getCompanyValidityDays(referenceDate);

        if (panelExpiry.getTime() >= customerExpiry.getTime()) continue;

        rows.push({
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

      const order = item.orderId ? orderById.get(String(item.orderId)) : null;
      const saleBase = item.allocatedAt || order?.createdAt || referenceDate;
      const saleDate = new Date(saleBase);
      if (Number.isNaN(saleDate.getTime())) continue;

      // Website: customer always gets 30 days from buy date — not panel expiry.
      const customerExpiry = calculateCompanyExpiryDate(saleDate);
      if (panelExpiry.getTime() >= customerExpiry.getTime()) continue;

      rows.push({
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
