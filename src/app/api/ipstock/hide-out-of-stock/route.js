import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import Company from '@/models/companyModel';
import { enforceAdmin } from '@/lib/apiSecurity';
const { companyUsesNetbayLiveStock } = require('@/lib/companyNetbayApi');
const { companyUsesResellerLiveStock } = require('@/lib/companyResellerApi');
const { stockHasNetbayPlans, stockHasResellerPanelPlans } = require('@/lib/ipStockAvailability');

function isStockOutOfStock(stock, companyDoc) {
  if (stock.company && companyDoc) {
    if (stockHasNetbayPlans(stock) && companyUsesNetbayLiveStock(companyDoc)) {
      return !stock.available;
    }
    if (stockHasResellerPanelPlans(stock) && companyUsesResellerLiveStock(companyDoc)) {
      return !stock.available;
    }
    return (Number(stock.stockCount) || 0) <= 0;
  }
  return !stock.available;
}

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    await connectDB();

    const stocks = await IPStock.find({}).lean();
    const companyIds = [...new Set(stocks.filter((s) => s.company).map((s) => String(s.company)))];
    const companies = companyIds.length
      ? await Company.find({ _id: { $in: companyIds } }).select('netbayApi resellerApi').lean()
      : [];
    const companyMap = Object.fromEntries(companies.map((c) => [String(c._id), c]));

    const toHide = stocks.filter((stock) => {
      if (stock.hiddenFromStore) return false;
      const companyDoc = stock.company ? companyMap[String(stock.company)] : null;
      return isStockOutOfStock(stock, companyDoc);
    });

    if (toHide.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No visible out-of-stock plans to hide',
        hiddenCount: 0,
        ids: [],
      });
    }

    const ids = toHide.map((s) => s._id);
    const result = await IPStock.updateMany(
      { _id: { $in: ids } },
      { $set: { hiddenFromStore: true, autoHiddenFromStore: true } }
    );

    return NextResponse.json({
      success: true,
      message: `Hidden ${result.modifiedCount} out-of-stock plan(s) from the store`,
      hiddenCount: result.modifiedCount,
      ids: ids.map(String),
      names: toHide.map((s) => s.name),
    });
  } catch (error) {
    console.error('[HIDE-OUT-OF-STOCK] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to hide out-of-stock plans' },
      { status: 500 }
    );
  }
}
