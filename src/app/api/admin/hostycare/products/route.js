import { NextResponse } from 'next/server';
const HostycareAPI = require('@/services/hostycareApi');

export async function GET(request) {
  try {
    console.log('[PRODUCTS-API] Fetching Hostycare products...');

    const hostycareApi = new HostycareAPI();

    // Get products with pricing
    const productsResponse = await hostycareApi.getProducts();
    console.log('[PRODUCTS-API] Raw products response:', JSON.stringify(productsResponse, null, 2));

    // Get account credit
    const creditResponse = await hostycareApi.getCredit();
    console.log('[PRODUCTS-API] Credit response:', creditResponse);

    // Extract products data - adjust based on actual response structure
    let products = [];

    if (productsResponse && productsResponse.data) {
      products = Array.isArray(productsResponse.data) ? productsResponse.data : [productsResponse.data];
    } else if (productsResponse && Array.isArray(productsResponse)) {
      products = productsResponse;
    } else if (productsResponse && productsResponse.products) {
      products = Array.isArray(productsResponse.products) ? productsResponse.products : [productsResponse.products];
    }

    console.log('[PRODUCTS-API] Extracted products count:', products.length);
    console.log('[PRODUCTS-API] First few products:', products.slice(0, 3));

    return NextResponse.json({
      success: true,
      products: products,
      credit: creditResponse?.data || creditResponse,
      count: products.length,
      debug: {
        rawProductsResponse: productsResponse,
        rawCreditResponse: creditResponse
      }
    });

  } catch (error) {
    console.error('[PRODUCTS-API] Failed to fetch products:', error);

    return NextResponse.json({
      success: false,
      error: error.message,
      details: 'Failed to fetch Hostycare products',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
