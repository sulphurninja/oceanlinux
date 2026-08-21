import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceCronSecret } from '@/lib/apiSecurity';
import { getDaysUntilExpiryIST } from '@/lib/expiryHelper';
import NotificationService from '@/services/notificationService';

const REMINDER_DAYS_BEFORE = 2;
const BACKUP_DAYS_BEFORE = 1;
const ACTIVE_STATUSES = ['confirmed', 'active', 'paid', 'completed'];

function isEligibleForReminder(order, daysLeft) {
  const expiryKey = new Date(order.expiryDate).toISOString();
  const alreadySentForCycle = order.paymentDetails?.expiryReminder2dFor === expiryKey;

  if (daysLeft === REMINDER_DAYS_BEFORE) return true;
  // Backup: cron missed the 2-day window — still remind at 1 day left
  if (daysLeft === BACKUP_DAYS_BEFORE && !alreadySentForCycle) return true;
  return false;
}

/**
 * Daily cron: email customers when VPS expires in 2 days (IST calendar).
 * Backup at 1 day if the 2-day run was missed.
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
      .select('_id user productName ipAddress expiryDate status paymentDetails customerEmail customerName')
      .lean();

    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const order of candidates) {
      const daysLeft = getDaysUntilExpiryIST(order.expiryDate);
      if (!isEligibleForReminder(order, daysLeft)) {
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
        await NotificationService.notifyServiceExpiring(order.user, order, daysLeft, {
          awaitEmail: true,
        });
        sent += 1;
      } catch (err) {
        await NotificationService.releaseExpiryReminderFlag(order._id, REMINDER_DAYS_BEFORE);
        errors.push({ orderId: String(order._id), error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      reminderDaysBefore: REMINDER_DAYS_BEFORE,
      backupDaysBefore: BACKUP_DAYS_BEFORE,
      scanned: candidates.length,
      sent,
      skipped,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
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
