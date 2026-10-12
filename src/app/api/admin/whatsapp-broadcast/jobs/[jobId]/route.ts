import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import { WhatsappBroadcastJob } from '@/models/whatsappBroadcastModel';
import { PROCESS_TIME_BUDGET_MS } from '@/lib/whatsappBroadcast';
import { broadcastJobSummary, processBroadcastJob } from '@/lib/whatsappBroadcastRunner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

const SUMMARY_SELECT =
  'slot accountLabel maskedKey templateName templateLanguage audience status totalRecipients cursor sentCount failedCount skippedCount error createdAt completedAt processing lastProcessedAt';

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();
    const job = await WhatsappBroadcastJob.findById(params.jobId).select(SUMMARY_SELECT).lean();
    if (!job) {
      return NextResponse.json({ message: 'Job not found' }, { status: 404, headers: NO_CACHE });
    }
    return NextResponse.json({ job: broadcastJobSummary(job) }, { headers: NO_CACHE });
  } catch (error: any) {
    console.error('[WA-BROADCAST][JOB][GET]', error);
    return NextResponse.json({ message: error.message || 'Failed to load job' }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403, headers: NO_CACHE });
    }

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'cancel') {
      const job = await WhatsappBroadcastJob.findOneAndUpdate(
        { _id: params.jobId, status: 'running' },
        { $set: { status: 'cancelled', completedAt: new Date(), processing: false } },
        { new: true },
      )
        .select(SUMMARY_SELECT)
        .lean();
      if (!job) {
        const existing = await WhatsappBroadcastJob.findById(params.jobId).select(SUMMARY_SELECT).lean();
        if (!existing) {
          return NextResponse.json({ message: 'Job not found' }, { status: 404, headers: NO_CACHE });
        }
        return NextResponse.json({ job: broadcastJobSummary(existing) }, { headers: NO_CACHE });
      }
      return NextResponse.json({ success: true, job: broadcastJobSummary(job) }, { headers: NO_CACHE });
    }

    if (action !== 'process') {
      return NextResponse.json({ message: "action must be 'process' or 'cancel'" }, { status: 400, headers: NO_CACHE });
    }

    const result = await processBroadcastJob(params.jobId, { timeBudgetMs: PROCESS_TIME_BUDGET_MS });
    if (!result.job) {
      return NextResponse.json({ message: 'Job not found' }, { status: 404, headers: NO_CACHE });
    }
    return NextResponse.json(
      { job: result.job, locked: result.locked },
      { headers: NO_CACHE },
    );
  } catch (error: any) {
    console.error('[WA-BROADCAST][JOB][POST]', error);
    return NextResponse.json({ message: error.message || 'Failed to process job' }, { status: 500, headers: NO_CACHE });
  }
}
