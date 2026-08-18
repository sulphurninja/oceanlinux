import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceAdmin, enforceCronSecret } from '@/lib/apiSecurity';

const { purgeExpiredSlotIpHistory } = require('@/lib/slotIpExpiryCleanup');

async function runPurge(request, { dryRun = false } = {}) {
  await connectDB();
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const olderThanDays = Number(body?.olderThanDays || 30);
  const result = await purgeExpiredSlotIpHistory({ olderThanDays, dryRun });
  return NextResponse.json({ success: true, ...result });
}

/** Admin preview */
export async function GET(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;
  return runPurge(request, { dryRun: true });
}

/** Admin purge now */
export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;
  return runPurge(request, { dryRun: false });
}

/** Cron can call with secret */
export async function DELETE(request) {
  const cronDenied = enforceCronSecret(request);
  if (cronDenied) return cronDenied;
  return runPurge(request, { dryRun: false });
}
