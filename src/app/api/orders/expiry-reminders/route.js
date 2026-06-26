import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceCronSecret } from '@/lib/apiSecurity';
import { getDaysUntilExpiry } from '@/lib/expiryHelper';
import NotificationService from '@/services/notificationService';

const REMINDER_DAYS_BEFORE = 2;
const ACTIVE_STATUSES = ['confirmed', 'active', 'paid', 'completed'];

/**
 * Daily cron: email customers when their VPS expires in exactly 2 days.
 * Auth: CRON_SECRET via x-cron-secret header or ?secret=
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  const startTime = Date.now();

  try {
    await connectDB();

    const candidates = await Order.find({
      expiryDate: { $exists: true, $ne: null, $gt: new Date() },
      status: { $in: ACTIVE_STATUSES },
    })
      .select('_id user productName ipAddress expiryDate status paymentDetails')
      .lean();

    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const order of candidates) {
      const daysLeft = getDaysUntilExpiry(order.expiryDate);
      if (daysLeft !== REMINDER_DAYS_BEFORE) {
        skipped += 1;
        continue;
      }

      const expiryKey = new Date(order.expiryDate).toISOString();
      const claimed = await NotificationService.claimExpiryReminderFlag(
        order._id,
        expiryKey,
        REMINDER_DAYS_BEFORE,
      );

      if (!claimed) {
        skipped += 1;
        continue;
      }

      try {
        await NotificationService.notifyServiceExpiring(order.user, order, REMINDER_DAYS_BEFORE);
        sent += 1;
      } catch (err) {
        errors.push({ orderId: String(order._id), error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      reminderDaysBefore: REMINDER_DAYS_BEFORE,
      scanned: candidates.length,
      sent,
      skipped,
      errors,
      executionTime: `${Date.now() - startTime}ms`,
    });
  } catch (error) {
    console.error('[EXPIRY-REMINDERS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return POST(request);
}
