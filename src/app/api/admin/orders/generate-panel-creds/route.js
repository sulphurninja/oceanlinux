import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { assignPanelCredentials } from '@/lib/panelCredentials';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
  }

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
