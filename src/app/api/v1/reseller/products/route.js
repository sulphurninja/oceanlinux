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

async function findResellerProductById(productId, reseller) {
  const stock = await IPStock.findOne({
    _id: productId,
    available: true,
    hiddenFromStore: { $ne: true },
  });
  if (stock) {
    return { product: formatResellerProduct(stock, reseller), productType: 'vps' };
  }

  const slotPkg = await SlotIPPackage.findById(productId).lean();
  if (slotPkg && slotPackageInStock(slotPkg)) {
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

    const [stocks, slotPackages] = await Promise.all([
      IPStock.find({ available: true, hiddenFromStore: { $ne: true } }).sort({ name: 1 }),
      SlotIPPackage.find({ available: true }).sort({ name: 1 }).lean(),
    ]);

    const vpsProducts = stocks.map((stock) => formatResellerProduct(stock, reseller));
    const slotProducts = slotPackages
      .filter((pkg) => slotPackageInStock(pkg))
      .map((pkg) => formatResellerSlotProduct(pkg, reseller));

    const products = [...vpsProducts, ...slotProducts].sort((a, b) =>
      String(a.name).localeCompare(String(b.name)),
    );

    return NextResponse.json({
      success: true,
      count: products.length,
      vpsCount: vpsProducts.length,
      slotIpCount: slotProducts.length,
      currency: reseller.wallet?.currency || 'INR',
      products,
    });
  } catch (error) {
    console.error('[RESELLER-PRODUCTS] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
