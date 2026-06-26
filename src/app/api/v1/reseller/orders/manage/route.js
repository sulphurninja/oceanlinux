import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { authenticateReseller } from '@/lib/resellerAuth';
import {
  UNIVERSAL_ACTIONS,
  executeResellerServerAction,
  getResellerManagementCapabilities,
  loadOrderIpStock,
  normalizeResellerAction,
} from '@/lib/resellerServerManage';

export async function POST(request) {
  await connectDB();

  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { orderId, action, osType } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'orderId is required' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({
        success: false,
        message: `action is required. Universal actions: ${UNIVERSAL_ACTIONS.join(', ')}`,
      }, { status: 400 });
    }

    const order = await Order.findOne({ _id: orderId, resellerId: auth.reseller._id });
    if (!order) {
      return NextResponse.json({
        success: false,
        message: 'Order not found or you do not have permission to manage it',
      }, { status: 404 });
    }

    if (order.status !== 'active' && order.status !== 'confirmed') {
      return NextResponse.json({
        success: false,
        message: `Cannot manage server. Order status is: ${order.status}`,
      }, { status: 400 });
    }

    const ipStock = await loadOrderIpStock(order);
    const result = await executeResellerServerAction({
      order,
      orderId,
      action,
      osType,
      ipStock,
    });

    await Order.findByIdAndUpdate(orderId, {
      $push: {
        logs: {
          action: `reseller_${normalizeResellerAction(action)}`,
          timestamp: new Date(),
          details: `Reseller API: ${action} by reseller ${auth.reseller._id}`,
          success: result.success,
        },
      },
    });

    const ipAddress =
      order.ipAddress ||
      order.serverDetails?.rawDetails?.ips?.[0] ||
      order.serviceDetails?.ipAddress ||
      result.data?.ip ||
      null;

    return NextResponse.json({
      success: result.success,
      action: result.action || normalizeResellerAction(action),
      orderId,
      ipAddress,
      message: result.message,
      code: result.code || null,
      data: result.data || null,
      supportedActions: result.supportedActions || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[RESELLER-MANAGE] Error:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Server action failed',
    }, { status: 500 });
  }
}

export async function GET(request) {
  await connectDB();

  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  return NextResponse.json({
    success: true,
    message: 'Universal Reseller Server Management API',
    description: 'Same actions for every product — OceanLinux routes to the correct provider internally.',
    universalActions: UNIVERSAL_ACTIONS,
    aliases: { format: 'reinstall', rebuild: 'reinstall', reboot: 'restart' },
    requestBody: {
      orderId: 'required — your order ID from POST /orders',
      action: `one of: ${UNIVERSAL_ACTIONS.join(', ')}`,
      osType: 'required for reinstall/changeos on some products — check GET /orders/{orderId} → management.osOptions',
    },
    flow: [
      '1. GET /orders/{orderId} → read management.supportedActions for that server',
      '2. POST /orders/manage with orderId + action (+ osType if needed)',
      '3. If action not supported, response includes supportedActions — no guesswork',
    ],
    examples: {
      status: { orderId: 'ORDER_ID', action: 'status' },
      reinstall: { orderId: 'ORDER_ID', action: 'reinstall', osType: 'ubuntu' },
      changeos: { orderId: 'ORDER_ID', action: 'changeos', osType: 'ubuntu' },
    },
  });
}
