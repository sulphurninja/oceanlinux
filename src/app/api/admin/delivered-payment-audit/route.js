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

    const body = await request.json().catch(() => ({}));
    const result = await auditDeliveredPayments({
      date: body?.date,
      from: body?.from,
      to: body?.to,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[DELIVERED-PAYMENT-AUDIT]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Audit failed' },
      { status: error.status || 500 }
    );
  }
}
