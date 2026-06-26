import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
import { validateAPIKey, apiAuthFailure } from '@/lib/api-utils';
import { formatServerProduct, filterServerProducts } from '@/lib/v1ServerApi';

export async function GET(request) {
  try {
    await connectDB();

    const auth = await validateAPIKey(request, { requiredPermission: 'servers:read' });
    if (!auth.success) return apiAuthFailure(auth);

    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location') || undefined;
    const minRam = searchParams.get('min_ram') || searchParams.get('minRam') || undefined;
    const maxPrice = searchParams.get('max_price') || searchParams.get('maxPrice') || undefined;

    const stocks = await IPStock.find({ available: true }).sort({ name: 1 });
    const products = stocks.map(formatServerProduct);
    const servers = filterServerProducts(products, { location, minRam, maxPrice });

    return NextResponse.json({
      success: true,
      count: servers.length,
      servers,
    });
  } catch (error) {
    console.error('[V1-SERVERS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
