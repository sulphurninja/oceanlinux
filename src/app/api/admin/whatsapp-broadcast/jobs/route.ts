import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { WhatsappBroadcastJob } from '@/models/whatsappBroadcastModel';
import {
  BROADCAST_SLOTS,
  accountFingerprint,
  buildAudience,
  maskApiKey,
  resolveSlotApiKey,
} from '@/lib/whatsappBroadcast';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

const JOB_LIST_SELECT =
  'slot accountLabel maskedKey templateName templateLanguage audience status totalRecipients cursor sentCount failedCount skippedCount error createdAt completedAt';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const jobs = await WhatsappBroadcastJob.find({})
      .select(JOB_LIST_SELECT)
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();

    return NextResponse.json({ jobs }, { headers: NO_CACHE });
  } catch (error: any) {
    console.error('[WA-BROADCAST][JOBS][GET]', error);
    return NextResponse.json({ message: error.message || 'Failed to load jobs' }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const body = await request.json();
    const slot = Number(body.slot);
    const templateName = String(body.templateName || '').trim();
    const templateLanguage = String(body.templateLanguage || 'en').trim() || 'en';
    const audience = body.audience;

    if (!BROADCAST_SLOTS.includes(slot)) {
      return NextResponse.json({ message: 'slot must be 1-7' }, { status: 400, headers: NO_CACHE });
    }
    if (!templateName) {
      return NextResponse.json({ message: 'templateName is required' }, { status: 400, headers: NO_CACHE });
    }
    if (!['purchasers', 'all'].includes(audience)) {
      return NextResponse.json({ message: "audience must be 'purchasers' or 'all'" }, { status: 400, headers: NO_CACHE });
    }

    const { apiKey, label } = await resolveSlotApiKey(slot);
    if (!apiKey) {
      return NextResponse.json({ message: `No API key configured for slot ${slot}` }, { status: 400, headers: NO_CACHE });
    }

    const fingerprint = accountFingerprint(apiKey);

    // Anti-spam: only one running broadcast at a time per Zaptick account.
    const activeJob = await WhatsappBroadcastJob.findOne({
      accountFingerprint: fingerprint,
      status: 'running',
    })
      .select('_id templateName audience')
      .lean();
    if (activeJob) {
      return NextResponse.json(
        {
          message: `This account already has a running broadcast ("${(activeJob as any).templateName}"). Wait for it to finish or cancel it first.`,
        },
        { status: 409, headers: NO_CACHE },
      );
    }

    const recipients = await buildAudience(audience);
    if (!recipients.length) {
      return NextResponse.json(
        { message: 'No customers with valid phone numbers found for this audience' },
        { status: 400, headers: NO_CACHE },
      );
    }

    const job = await WhatsappBroadcastJob.create({
      slot,
      accountLabel: label,
      accountFingerprint: fingerprint,
      maskedKey: maskApiKey(apiKey),
      templateName,
      templateLanguage,
      audience,
      status: 'running',
      recipients,
      totalRecipients: recipients.length,
      createdBy: (admin as any)._id,
    });

    return NextResponse.json(
      {
        success: true,
        job: {
          _id: job._id,
          slot,
          templateName,
          audience,
          status: 'running',
          totalRecipients: recipients.length,
          cursor: 0,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
        },
      },
      { headers: NO_CACHE },
    );
  } catch (error: any) {
    console.error('[WA-BROADCAST][JOBS][POST]', error);
    return NextResponse.json({ message: error.message || 'Failed to create broadcast' }, { status: 500, headers: NO_CACHE });
  }
}
