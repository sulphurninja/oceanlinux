import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

function isAdminUser(user) {
  if (!user) return false;
  return (
    user.userType === 'admin' ||
    user.isAdmin === true ||
    user.role === 'Admin' ||
    user.role === 'admin'
  );
}

/**
 * POST /api/admin/orders/transfer
 * Body: { orderId, targetUserEmail } or { orderId, targetUserId }
 */
export async function POST(request) {
  try {
    await connectDB();

    const adminId = getDataFromToken(request);
    if (!adminId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const admin = await User.findById(adminId).select('userType isAdmin role name email');
    if (!isAdminUser(admin)) {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const orderId = body?.orderId;
    const targetUserEmail = typeof body?.targetUserEmail === 'string' ? body.targetUserEmail.trim().toLowerCase() : '';
    const targetUserId = body?.targetUserId;

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'orderId is required' }, { status: 400 });
    }

    if (!targetUserEmail && !targetUserId) {
      return NextResponse.json(
        { success: false, message: 'targetUserEmail or targetUserId is required' },
        { status: 400 }
      );
    }

    const order = await Order.findById(orderId).populate('user', 'name email');
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const fromUserId = order.user?._id?.toString() || order.user?.toString();
    let targetUser = null;

    if (targetUserId) {
      targetUser = await User.findById(targetUserId).select('name email');
    } else {
      targetUser = await User.findOne({ email: targetUserEmail }).select('name email');
    }

    if (!targetUser) {
      return NextResponse.json({ success: false, message: 'Target user not found' }, { status: 404 });
    }

    const toUserId = targetUser._id.toString();
    if (fromUserId === toUserId) {
      return NextResponse.json(
        { success: false, message: 'Service is already assigned to this user' },
        { status: 400 }
      );
    }

    const previousOwner = {
      userId: fromUserId,
      name: order.user?.name || null,
      email: order.user?.email || null,
    };

    order.user = targetUser._id;
    order.customerEmail = targetUser.email;
    order.customerName = targetUser.name;

    const existingMeta =
      order.apiMetadata && typeof order.apiMetadata === 'object' ? order.apiMetadata : {};
    order.apiMetadata = {
      ...existingMeta,
      lastTransfer: {
        fromUserId: previousOwner.userId,
        fromEmail: previousOwner.email,
        toUserId,
        toEmail: targetUser.email,
        transferredAt: new Date(),
        transferredBy: adminId,
      },
    };

    order.markModified('apiMetadata');
    await order.save();

    const updated = await Order.findById(orderId).populate('user', 'name email').lean();

    return NextResponse.json({
      success: true,
      message: `Service transferred to ${targetUser.email}`,
      order: updated,
      transfer: {
        from: previousOwner,
        to: {
          userId: toUserId,
          name: targetUser.name,
          email: targetUser.email,
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN/ORDERS/TRANSFER] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to transfer service' },
      { status: 500 }
    );
  }
}
