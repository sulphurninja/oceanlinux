import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import { formatResellerProduct } from '@/lib/resellerOrderApi';

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
      const stock = await IPStock.findOne({ _id: productId, available: true, hiddenFromStore: { $ne: true } });
      if (!stock) {
        return NextResponse.json(
          { success: false, message: 'Product not found or unavailable' },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        currency: reseller.wallet?.currency || 'INR',
        product: formatResellerProduct(stock, reseller),
      });
    }

    const stocks = await IPStock.find({ available: true, hiddenFromStore: { $ne: true } }).sort({ name: 1 });
    const products = stocks.map((stock) => formatResellerProduct(stock, reseller));

    return NextResponse.json({
      success: true,
      count: products.length,
      currency: reseller.wallet?.currency || 'INR',
      products,
    });
  } catch (error) {
    console.error('[RESELLER-PRODUCTS] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
