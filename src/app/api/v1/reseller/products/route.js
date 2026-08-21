import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import {
  formatResellerProduct,
  formatResellerSlotProduct,
  slotPackageInStock,
} from '@/lib/resellerOrderApi';

const SlotIPPackage = require('@/models/slotIpPackageModel');

/**
 * Live availability on the store is refreshed by the browser when a customer
 * opens /dashboard/ipStock. API resellers never trigger that, so without this
 * they read whatever `available` was last written — stale by hours if nobody
 * browsed the store. Every refresh helper is self-throttled via a global
 * timestamp, so calling them on each request is cheap and coalesces.
 */
async function syncLiveStock() {
  const tasks = [
    import('@/lib/advpsStockRefresh').then((m) => m.refreshAdvpsStockForCustomer({})),
    import('@/lib/resellerLiveStock').then((m) => m.refreshResellerStockForCustomer({})),
    import('@/lib/kurohostLiveStock').then((m) => m.refreshKurohostStockForCustomer({})),
    import('@/lib/netbayLiveStock').then((m) => m.refreshNetbayStockForCustomer({})),
  ];
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[RESELLER-PRODUCTS] live stock refresh failed:', r.reason?.message);
    }
  }
}

async function findResellerProductById(productId, reseller) {
  // No `available` filter — an out-of-stock plan must still be readable so the
  // reseller's storefront can render it. Ordering is gated separately.
  const stock = await IPStock.findOne({
    _id: productId,
    hiddenFromStore: { $ne: true },
  });
  if (stock) {
    const product = formatResellerProduct(stock, reseller);
    return { product, productType: product.productType || 'vps' };
  }

  const slotPkg = await SlotIPPackage.findById(productId).lean();
  if (slotPkg && slotPkg.available !== false) {
    return { product: formatResellerSlotProduct(slotPkg, reseller), productType: 'slotip' };
  }

  return null;
}

export async function GET(request) {
  await connectDB();

  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { reseller } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('id') || searchParams.get('productId');
    // Default stays in-stock-only: existing reseller integrations treat every
    // returned product as buyable. Sold-out plans are opt-in.
    const includeOutOfStock =
      searchParams.get('includeOutOfStock') === '1' ||
      searchParams.get('includeOutOfStock') === 'true';

    await syncLiveStock();

    if (productId) {
      const found = await findResellerProductById(productId, reseller);
      if (!found) {
        return NextResponse.json(
          { success: false, message: 'Product not found or unavailable' },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        currency: reseller.wallet?.currency || 'INR',
        productType: found.productType,
        product: found.product,
      });
    }

    // `hiddenFromStore` stays filtered — those are deliberately delisted by the
    // admin. Availability itself is filtered after formatting so the counts can
    // report what was held back.
    const [stocks, slotPackages] = await Promise.all([
      IPStock.find({ hiddenFromStore: { $ne: true } }).sort({ name: 1 }),
      SlotIPPackage.find({ available: { $ne: false } }).sort({ name: 1 }).lean(),
    ]);

    const vpsProducts = stocks.map((stock) => formatResellerProduct(stock, reseller));
    const slotProducts = slotPackages.map((pkg) => ({
      ...formatResellerSlotProduct(pkg, reseller),
      inStock: slotPackageInStock(pkg),
    }));

    const all = [...vpsProducts, ...slotProducts].sort((a, b) =>
      String(a.name).localeCompare(String(b.name)),
    );

    const products = includeOutOfStock ? all : all.filter((p) => p.inStock);
    const inStockCount = all.filter((p) => p.inStock).length;

    return NextResponse.json({
      success: true,
      count: products.length,
      vpsCount: products.filter((p) => p.productType !== 'slotip').length,
      slotIpCount: products.filter((p) => p.productType === 'slotip').length,
      inStockCount,
      outOfStockCount: all.length - inStockCount,
      currency: reseller.wallet?.currency || 'INR',
      products,
    });
  } catch (error) {
    console.error('[RESELLER-PRODUCTS] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
