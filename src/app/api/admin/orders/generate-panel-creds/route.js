import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import User from '@/models/userModel';
import { assignPanelCredentials } from '@/lib/panelCredentials';

async function verifyAdmin() {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await connectDB();
    const user = await User.findById(decoded.userId);
    if (!user || user.role !== 'admin') return null;
    return user;
  } catch {
    return null;
  }
}

export async function POST() {
  const admin = await verifyAdmin();


  await connectDB();

  const orders = await Order.find({
    panelUsername: { $exists: false },
    status: { $in: ['active', 'confirmed', 'paid', 'completed'] },
  });

  if (orders.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'All eligible orders already have panel credentials.',
      generated: 0,
    });
  }

  let generated = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await assignPanelCredentials(order);
      await Order.updateOne(
        { _id: order._id },
        { $set: { panelUsername: order.panelUsername, panelPassword: order.panelPassword } }
      );
      generated++;
    } catch (err) {
      console.error(`Failed to generate creds for order ${order._id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Generated credentials for ${generated} orders${failed > 0 ? `, ${failed} failed` : ''}.`,
    generated,
    failed,
    total: orders.length,
  });
}
