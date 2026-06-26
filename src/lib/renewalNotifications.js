import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import NotificationService from '@/services/notificationService';

/**
 * Send renewal success in-app + email notification (idempotent per renewalTxnId).
 */
export async function notifyRenewalCompleted(orderOrId, newExpiryDate, renewalTxnId) {
  await connectDB();

  const order =
    orderOrId && typeof orderOrId === 'object' && orderOrId._id
      ? orderOrId
      : await Order.findById(orderOrId);

  if (!order?.user) return { sent: false, reason: 'order or user missing' };

  const fresh = await Order.findById(order._id).lean();
  if (!fresh) return { sent: false, reason: 'order not found' };

  await NotificationService.notifyRenewalSuccess(
    fresh.user,
    fresh,
    newExpiryDate,
    renewalTxnId,
  );

  return { sent: true };
}
