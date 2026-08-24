import { NextResponse } from 'next/server';
import { GET as getProducts } from '../products/route';

/** GET /api/v1/reseller/plans — alias for /products (XiteNodes-style naming) */
export async function GET(request) {
  const res = await getProducts(request);
  const data = await res.json();
  if (!data.success) return NextResponse.json(data, { status: res.status });

  if (data.product) {
    return NextResponse.json({
      success: true,
      currency: data.currency,
      productType: data.productType,
      plan: {
        id: data.product._id,
        name: data.product.name,
        description: data.product.description,
        serverType: data.product.serverType,
        productType: data.productType,
        available: data.product.inStock !== false,
        memoryOptions: data.product.memoryOptions,
        tags: data.product.tags,
      },
    });
  }

  const plans = (data.products || []).map((p) => ({
    id: p._id,
    name: p.name,
    description: p.description,
    serverType: p.serverType,
    productType: p.productType,
    available: p.inStock !== false,
    memoryOptions: p.memoryOptions,
    tags: p.tags,
  }));

  return NextResponse.json({
    success: true,
    count: plans.length,
    inStockCount: data.inStockCount,
    currency: data.currency,
    plans,
    legacy: { productsPath: '/products' },
  });
}
