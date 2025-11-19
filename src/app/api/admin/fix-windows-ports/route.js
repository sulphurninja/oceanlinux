import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { formatIpAddress } from '@/lib/ipAddressHelper.js';

/**
 * Admin endpoint to fix Windows Hostycare orders that need port 49965
 * This will update existing orders to add the port if missing
 */
export async function POST(request) {
  try {
    await connectDB();

    // Find all Windows Hostycare orders that have IP addresses
    const windowsHostycareOrders = await Order.find({
      $or: [
        { provider: 'hostycare' },
        { provider: { $exists: false } }, // Default provider is hostycare
        { provider: null }
      ],
      os: { $regex: /windows/i },
      ipAddress: { $exists: true, $ne: '', $ne: 'Pending - Server being provisioned' }
    });

    console.log(`[FIX-WINDOWS-PORTS] Found ${windowsHostycareOrders.length} Windows Hostycare orders`);

    let updatedCount = 0;
    let skippedCount = 0;
    const updates = [];

    for (const order of windowsHostycareOrders) {
      // Check if port is already added
      if (order.ipAddress.includes(':49965')) {
        console.log(`[FIX-WINDOWS-PORTS] Order ${order._id} already has port, skipping`);
        skippedCount++;
        continue;
      }

      // Format the IP address with port
      const formattedIpAddress = formatIpAddress(
        order.ipAddress,
        order.provider || 'hostycare',
        order.os
      );

      // Update the order
      await Order.findByIdAndUpdate(order._id, {
        ipAddress: formattedIpAddress
      });

      console.log(`[FIX-WINDOWS-PORTS] Updated order ${order._id}: ${order.ipAddress} -> ${formattedIpAddress}`);
      
      updates.push({
        orderId: order._id.toString(),
        oldIpAddress: order.ipAddress,
        newIpAddress: formattedIpAddress,
        os: order.os,
        provider: order.provider || 'hostycare (default)'
      });

      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${updatedCount} Windows Hostycare orders`,
      totalFound: windowsHostycareOrders.length,
      updated: updatedCount,
      skipped: skippedCount,
      updates: updates
    });

  } catch (error) {
    console.error('[FIX-WINDOWS-PORTS] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * GET endpoint to preview which orders would be updated
 */
export async function GET(request) {
  try {
    await connectDB();

    // Find all Windows Hostycare orders that have IP addresses
    const windowsHostycareOrders = await Order.find({
      $or: [
        { provider: 'hostycare' },
        { provider: { $exists: false } },
        { provider: null }
      ],
      os: { $regex: /windows/i },
      ipAddress: { $exists: true, $ne: '', $ne: 'Pending - Server being provisioned' }
    }).select('_id productName ipAddress os provider user');

    const needsUpdate = windowsHostycareOrders.filter(
      order => !order.ipAddress.includes(':49965')
    );

    const alreadyFixed = windowsHostycareOrders.filter(
      order => order.ipAddress.includes(':49965')
    );

    return NextResponse.json({
      success: true,
      total: windowsHostycareOrders.length,
      needsUpdate: needsUpdate.length,
      alreadyFixed: alreadyFixed.length,
      orders: {
        needsUpdate: needsUpdate.map(order => ({
          orderId: order._id.toString(),
          productName: order.productName,
          currentIpAddress: order.ipAddress,
          willBecome: formatIpAddress(order.ipAddress, order.provider || 'hostycare', order.os),
          os: order.os,
          provider: order.provider || 'hostycare (default)'
        })),
        alreadyFixed: alreadyFixed.map(order => ({
          orderId: order._id.toString(),
          productName: order.productName,
          ipAddress: order.ipAddress,
          os: order.os,
          provider: order.provider || 'hostycare (default)'
        }))
      }
    });

  } catch (error) {
    console.error('[FIX-WINDOWS-PORTS] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

