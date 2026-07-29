import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Order from '@/models/orderModel';
import { enforceCronSecret } from '@/lib/apiSecurity';
import {
  getDaysUntilExpiryIST,
  RENEWAL_DAYS_AFTER_EXPIRY,
} from '@/lib/expiryHelper';
import NotificationService from '@/services/notificationService';

const ACTIVE_STATUSES = ['confirmed', 'active', 'paid', 'completed'];
/** Notify on expiry day (0), day after (-1), or one backup day (-2) if cron missed. */
const SUSPENSION_NOTIFY_MAX_DAYS_PAST = 2;

function isEligibleForSuspensionNotice(daysLeft) {
  if (daysLeft > 0) return false;
  if (daysLeft < -RENEWAL_DAYS_AFTER_EXPIRY) return false;
  return daysLeft >= -SUSPENSION_NOTIFY_MAX_DAYS_PAST;
}

/**
 * Daily cron: email customers when their VPS has expired (suspended for non-renewal).
 * Runs after expiry-reminders. One email per expiry cycle (idempotent flag).
 * Auth: CRON_SECRET
 */
export async function POST(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;

  const startTime = Date.now();

  try {
    await connectDB();

    const candidates = await Order.find({
      expiryDate: { $exists: true, $ne: null },
      status: { $in: ACTIVE_STATUSES },
    })
      .select('_id user productName ipAddress expiryDate status paymentDetails customerEmail customerName')
      .lean();

    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const order of candidates) {
      const daysLeft = getDaysUntilExpiryIST(order.expiryDate);

      // Expired recently (today, yesterday, or backup day) — still within renewal grace
      if (!isEligibleForSuspensionNotice(daysLeft)) {
        skipped += 1;
        continue;
      }

      const expiryKey = new Date(order.expiryDate).toISOString();
      const claimed = await NotificationService.claimSuspensionEmailFlag(order._id, expiryKey);
      if (!claimed) {
        skipped += 1;
        continue;
      }

      try {
        await NotificationService.notifyServiceSuspended(order.user, order, { awaitEmail: true });
        sent += 1;
      } catch (err) {
        await NotificationService.releaseSuspensionEmailFlag(order._id);
        errors.push({ orderId: String(order._id), error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      scanned: candidates.length,
      sent,
      skipped,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
      executionTime: `${Date.now() - startTime}ms`,
    });
  } catch (error) {
    console.error('[SUSPENSION-NOTICES] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
