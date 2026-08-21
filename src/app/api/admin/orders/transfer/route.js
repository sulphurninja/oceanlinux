import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { requireAdmin } from '@/lib/adminAuth';
import { findUserByEmail } from '@/lib/userEmail';
import NotificationService from '@/services/notificationService';

/**
 * POST /api/admin/orders/transfer
 * Body: { orderId, targetUserEmail } or { orderId, targetUserId }
 */
export async function POST(request) {
  try {
    await connectDB();

    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const orderId = body?.orderId;
    const targetUserEmail =
      typeof body?.targetUserEmail === 'string' ? body.targetUserEmail.trim() : '';
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

    const order = await Order.findById(orderId).populate('user', 'name email').lean();
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const fromUserId =
      order.user?._id?.toString?.() || order.user?.toString?.() || String(order.user || '');

    let targetUser = null;
    if (targetUserId) {
      targetUser = await User.findById(targetUserId).select('name email').lean();
    } else {
      targetUser = await findUserByEmail(User, targetUserEmail);
      if (targetUser) {
        targetUser = await User.findById(targetUser._id).select('name email').lean();
      }
    }

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          message: 'Target user not found. They must register on OceanLinux first.',
        },
        { status: 404 }
      );
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
      name: order.user?.name || order.customerName || null,
      email: order.user?.email || order.customerEmail || null,
    };

    const existingMeta =
      order.apiMetadata && typeof order.apiMetadata === 'object' && !Array.isArray(order.apiMetadata)
        ? order.apiMetadata
        : {};

    const updated = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          user: targetUser._id,
          customerEmail: targetUser.email,
          customerName: targetUser.name,
          apiMetadata: {
            ...existingMeta,
            lastTransfer: {
              fromUserId: previousOwner.userId,
              fromEmail: previousOwner.email,
              toUserId,
              toEmail: targetUser.email,
              transferredAt: new Date(),
              transferredBy: admin._id.toString(),
            },
          },
        },
      },
      { new: true, runValidators: true }
    )
      .populate('user', 'name email')
      .lean();

    if (!updated) {
      return NextResponse.json({ success: false, message: 'Failed to update order owner' }, { status: 500 });
    }

    const verifiedUserId =
      updated.user?._id?.toString?.() || updated.user?.toString?.() || String(updated.user || '');
    if (verifiedUserId !== toUserId) {
      console.error('[ADMIN/ORDERS/TRANSFER] Owner mismatch after update', {
        orderId,
        expected: toUserId,
        actual: verifiedUserId,
      });
      return NextResponse.json(
        { success: false, message: 'Transfer did not persist — please try again' },
        { status: 500 }
      );
    }

    try {
      await NotificationService.create(
        targetUser._id,
        'order',
        'Service transferred to your account',
        `${updated.productName} has been moved to your account.`,
        { orderId: updated._id.toString() },
        { actionUrl: '/dashboard/orders', priority: 'high' }
      );
    } catch (notifErr) {
      console.warn('[ADMIN/ORDERS/TRANSFER] Notification failed (non-fatal):', notifErr.message);
    }

    console.log(
      `[ADMIN/ORDERS/TRANSFER] Order ${orderId} transferred ${previousOwner.email} → ${targetUser.email}`
    );

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
