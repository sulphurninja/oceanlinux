import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

const { releaseTrialSlotForResell } = require('@/lib/trialVpsExpiredSlots');

export async function POST(request) {
  await connectDB();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const packageId = body?.packageId;
    const slotId = body?.slotId;
    if (!packageId || !slotId) {
      return NextResponse.json({ error: 'packageId and slotId required' }, { status: 400 });
    }

    const result = await releaseTrialSlotForResell({
      packageId,
      slotId,
      password: body?.password,
    });

    if (!result.ok) {
      const messages = {
        package_not_found: 'Package not found',
        slot_not_found: 'Slot not found',
        already_released: 'Slot is already free for resell',
        trial_still_active: 'Customer trial has not expired yet',
      };
      return NextResponse.json(
        { error: messages[result.reason] || 'Release failed', reason: result.reason },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[TRIAL-VPS] release-slot error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
