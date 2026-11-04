import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceAdmin } from '@/lib/apiSecurity';

const { auditDeliveredPayments } = require('@/lib/deliveredPaymentAudit');

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  try {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();
    require('@/models/userModel').default;

    const body = await request.json().catch(() => ({}));
    const started = Date.now();
    const result = await auditDeliveredPayments({
      date: body?.date,
      from: body?.from,
      to: body?.to,
    });
    console.log(
      `[DELIVERED-PAYMENT-AUDIT] ${result.from}→${result.to} checked=${result.checked} doubt=${result.doubtCount} ms=${Date.now() - started}`
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[DELIVERED-PAYMENT-AUDIT]', error);
    const status = error.status && Number(error.status) >= 400 && Number(error.status) < 600 ? error.status : 500;
    return NextResponse.json(
      { success: false, message: error.message || 'Audit failed' },
      { status }
    );
  }
}
