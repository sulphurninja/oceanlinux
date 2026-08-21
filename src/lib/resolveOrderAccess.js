import User from '@/models/userModel';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import { isAdminUser } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

/**
 * Load an order for the logged-in user, or any order when the caller is admin.
 */
export async function resolveOrderForUserOrAdmin(request, orderId, { lean = false } = {}) {
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch {
    return {
      error: NextResponse.json({ message: 'Unauthorized', success: false }, { status: 401 }),
    };
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized', success: false }, { status: 401 }),
    };
  }

  const admin = isAdminUser(user);
  let order;
  if (admin) {
    order = lean
      ? await Order.findById(orderId).lean()
      : await Order.findById(orderId);
  } else {
    order = lean
      ? await Order.findOne({ _id: orderId, user: userId }).lean()
      : await Order.findOne({ _id: orderId, user: userId });
  }

  if (!order) {
    return {
      error: NextResponse.json({ message: 'Order not found', success: false }, { status: 404 }),
    };
  }

  return { order, user, userId, isAdmin: admin };
}
