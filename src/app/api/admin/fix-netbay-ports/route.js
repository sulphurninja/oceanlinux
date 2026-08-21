import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { formatIpAddress, NETBAY_DISPLAY_PORT } from '@/lib/ipAddressHelper.js';
import { enforceAdmin } from '@/lib/apiSecurity';

/**
 * Admin endpoint: Netbay Windows VPS get :5517; Linux stays bare IP.
 */
export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    await connectDB();

    const netbayOrders = await Order.find({
      $or: [{ provider: 'netbay' }, { netbayServiceId: { $exists: true, $nin: [null, ''] } }],
      ipAddress: { $exists: true, $ne: '', $ne: 'Pending - Server being provisioned' },
    });

    console.log(`[FIX-NETBAY-PORTS] Found ${netbayOrders.length} Netbay orders with IP`);

    let updatedCount = 0;
    let skippedCount = 0;
    const updates = [];

    for (const order of netbayOrders) {
      const formattedIpAddress = formatIpAddress(order.ipAddress, 'netbay', order.os);

      if (formattedIpAddress === order.ipAddress) {
        skippedCount++;
        continue;
      }

      await Order.findByIdAndUpdate(order._id, {
        ipAddress: formattedIpAddress,
      });

      updates.push({
        orderId: order._id.toString(),
        oldIpAddress: order.ipAddress,
        newIpAddress: formattedIpAddress,
        os: order.os,
        provider: order.provider || 'netbay',
      });

      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} Netbay orders (Windows → :${NETBAY_DISPLAY_PORT}, Linux → bare IP)`,
      totalFound: netbayOrders.length,
      updated: updatedCount,
      skipped: skippedCount,
      updates,
    });
  } catch (error) {
    console.error('[FIX-NETBAY-PORTS] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    await connectDB();

    const netbayOrders = await Order.find({
      $or: [{ provider: 'netbay' }, { netbayServiceId: { $exists: true, $nin: [null, ''] } }],
      ipAddress: { $exists: true, $ne: '', $ne: 'Pending - Server being provisioned' },
    }).select('_id productName ipAddress os provider netbayServiceId user');

    const portSuffix = `:${NETBAY_DISPLAY_PORT}`;
    const needsUpdate = netbayOrders.filter((order) => {
      const expected = formatIpAddress(order.ipAddress, 'netbay', order.os);
      return expected !== order.ipAddress;
    });
    const alreadyCorrect = netbayOrders.filter((order) => {
      const expected = formatIpAddress(order.ipAddress, 'netbay', order.os);
      return expected === order.ipAddress;
    });

    return NextResponse.json({
      success: true,
      total: netbayOrders.length,
      needsUpdate: needsUpdate.length,
      alreadyCorrect: alreadyCorrect.length,
      orders: {
        needsUpdate: needsUpdate.map((order) => ({
          orderId: order._id.toString(),
          productName: order.productName,
          currentIpAddress: order.ipAddress,
          willBecome: formatIpAddress(order.ipAddress, 'netbay', order.os),
          os: order.os,
          provider: order.provider || 'netbay',
          isWindows: String(order.os || '').toLowerCase().includes('windows'),
        })),
        alreadyCorrect: alreadyCorrect.map((order) => ({
          orderId: order._id.toString(),
          productName: order.productName,
          ipAddress: order.ipAddress,
          os: order.os,
          provider: order.provider || 'netbay',
        })),
      },
    });
  } catch (error) {
    console.error('[FIX-NETBAY-PORTS] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
