import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import IPStock from '@/models/ipStockModel';
import {
  getResellerForUserId,
  applyResellerPricingToStocks,
  applyResellerPricingToSlot,
} from '@/lib/resellerStorePricing';
import { memoryOptionsToObject } from '@/lib/resellerOrderApi';

const SlotIPPackage = require('@/models/slotIpPackageModel');

/**
 * GET /api/reseller/rates
 * Session-authenticated rate card for the logged-in reseller — powers the
 * "Your API Rates" section in the Reseller Console. Read-only; ordering
 * happens via /api/v1/reseller/orders with API credentials.
 */
export async function GET(request) {
  await connectDB();

  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const reseller = await getResellerForUserId(userId);
  if (!reseller) {
    return NextResponse.json({ success: false, message: 'Reseller access required' }, { status: 403 });
  }

  try {
    const [stocksRaw, slotsRaw] = await Promise.all([
      IPStock.find({ hiddenFromStore: { $ne: true } })
        .select('name serverType tags available memoryOptions')
        .lean()
        .maxTimeMS(10000),
      SlotIPPackage.find({ available: true }).select('name description price available ips').lean(),
    ]);

    const pricedStocks = applyResellerPricingToStocks(stocksRaw, reseller);

    const plans = pricedStocks.map((stock) => {
      const options = memoryOptionsToObject(stock.memoryOptions);
      const rates = Object.entries(options || {})
        .filter(([memory, details]) => memory && details && Number(details.price) > 0)
        .map(([memory, details]) => ({
          memory,
          price: Number(details.price),
          listPrice: details.listPrice != null ? Number(details.listPrice) : null,
        }))
        .sort((a, b) => a.price - b.price);

      return {
        id: String(stock._id),
        name: stock.name,
        serverType: stock.serverType || '',
        tags: Array.isArray(stock.tags) ? stock.tags : [],
        available: stock.available !== false && rates.length > 0,
        rates,
      };
    }).filter((p) => p.rates.length > 0);

    const slotIps = (slotsRaw || []).map((pkg) => {
      const priced = applyResellerPricingToSlot(pkg, reseller);
      const availableIps = (pkg.ips || []).filter((ip) => !ip.allocated).length;
      return {
        id: String(pkg._id),
        name: pkg.name,
        pricePerIp: Number(priced.price),
        listPrice: priced.listPrice != null ? Number(priced.listPrice) : null,
        available: pkg.available !== false && availableIps > 0,
      };
    });

    return NextResponse.json({ success: true, plans, slotIps });
  } catch (error) {
    console.error('[RESELLER-RATES] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load rates', error: error.message },
      { status: 500 }
    );
  }
}
