// /src/app/api/dev/check-order-ipstock/route.ts
// Diagnostic tool to check if Order -> IPStock -> SmartVPS Package mapping is correct
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
const Order = require('@/models/orderModel').default;
const IPStock = require('@/models/ipStockModel');
const SmartVpsAPI = require('@/services/smartvpsApi');

export async function GET(request: Request) {
  try {
    await connectDB();

    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({
        error: 'Missing orderId parameter',
        usage: '/api/dev/check-order-ipstock?orderId=YOUR_ORDER_ID'
      }, { status: 400 });
    }

    // Step 1: Load Order
    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ error: `Order ${orderId} not found` }, { status: 404 });
    }

    // Step 2: Load IPStock
    let ipStock = null;
    if (order.ipStockId) {
      ipStock = await IPStock.findById(order.ipStockId);
    }
    if (!ipStock) {
      ipStock = await IPStock.findOne({ 
        name: { $regex: new RegExp(order.productName, 'i') } 
      });
    }

    if (!ipStock) {
      return NextResponse.json({
        error: `IPStock not found for order`,
        order: {
          _id: order._id,
          productName: order.productName,
          ipStockId: order.ipStockId,
          ipAddress: order.ipAddress,
        }
      }, { status: 404 });
    }

    // Step 3: Extract SmartVPS config
    const smartvpsConfig = ipStock?.defaultConfigurations?.smartvps || 
                          ipStock?.defaultConfigurations?.get?.('smartvps');

    if (!smartvpsConfig) {
      return NextResponse.json({
        error: 'IPStock missing SmartVPS configuration',
        ipStock: {
          _id: ipStock._id,
          name: ipStock.name,
          provider: ipStock.provider,
          defaultConfigurations: ipStock.defaultConfigurations
        }
      }, { status: 400 });
    }

    // Step 4: Fetch current SmartVPS packages
    const smartvpsApi = new SmartVpsAPI();
    const apiResponse = await smartvpsApi.ipstock();
    const apiData = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;
    const packages = Array.isArray(apiData?.packages) ? apiData.packages : [];

    // Step 5: Find matching package
    const storedPid = String(smartvpsConfig.packagePid || '');
    const storedName = String(smartvpsConfig.packageName || '');
    
    const matchByPid = packages.find((p: any) => String(p.id) === storedPid);

    // Step 6: Build diagnostic report
    const report = {
      order: {
        _id: order._id,
        productName: order.productName,
        ipStockId: order.ipStockId,
        memory: order.memory,
        provisionedIP: order.ipAddress,
        status: order.status,
        provisioningStatus: order.provisioningStatus,
      },
      ipStock: {
        _id: ipStock._id,
        displayName: ipStock.name,
        provider: ipStock.provider,
        available: ipStock.available,
        tags: ipStock.tags,
      },
      smartvpsConfig: {
        packagePid: storedPid,
        packageName: storedName,
      },
      apiPackageFound: !!matchByPid,
      apiPackage: matchByPid ? {
        id: matchByPid.id,
        name: matchByPid.name,
        ipv4: matchByPid.ipv4,
        status: matchByPid.status,
      } : null,
      diagnosis: {
        pidMatches: matchByPid ? String(matchByPid.id) === storedPid : false,
        nameMatches: matchByPid ? String(matchByPid.name) === storedName : false,
        expectedPackageName: storedName,
        actualPackageName: matchByPid?.name || 'NOT FOUND',
        issue: !matchByPid 
          ? `❌ Package with PID ${storedPid} not found in SmartVPS API`
          : (String(matchByPid.name) !== storedName 
              ? `⚠️ Package name changed: "${storedName}" → "${matchByPid.name}"`
              : `✅ Perfect match`
          ),
      },
      allAvailablePackages: packages.map((p: any) => ({
        id: p.id,
        name: p.name,
        ipv4: p.ipv4,
        status: p.status,
      })),
    };

    return NextResponse.json(report, { status: 200 });

  } catch (error: any) {
    console.error('[CHECK-ORDER-IPSTOCK] Error:', error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

