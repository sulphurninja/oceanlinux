import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';
import {
  WhatsappBroadcastJob,
  WhatsappBroadcastSend,
} from '@/models/whatsappBroadcastModel';
import {
  PROCESS_BATCH_SIZE,
  SEND_INTERVAL_MS,
  STALE_LOCK_MS,
  accountFingerprint,
  createZaptickClient,
  resolveSlotApiKey,
} from '@/lib/whatsappBroadcast';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

const SUMMARY_SELECT =
  'slot accountLabel maskedKey templateName templateLanguage audience status totalRecipients cursor sentCount failedCount skippedCount error createdAt completedAt processing lastProcessedAt';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jobSummary(job: any) {
  return {
    _id: job._id,
    slot: job.slot,
    accountLabel: job.accountLabel,
    maskedKey: job.maskedKey,
    templateName: job.templateName,
    audience: job.audience,
    status: job.status,
    totalRecipients: job.totalRecipients,
    cursor: job.cursor,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
    error: job.error || '',
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

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
    return NextResponse.json({ job: jobSummary(job) }, { headers: NO_CACHE });
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
        return NextResponse.json({ job: jobSummary(existing) }, { headers: NO_CACHE });
      }
      return NextResponse.json({ success: true, job: jobSummary(job) }, { headers: NO_CACHE });
    }

    if (action !== 'process') {
      return NextResponse.json({ message: "action must be 'process' or 'cancel'" }, { status: 400, headers: NO_CACHE });
    }

    // Acquire the processing lock atomically so two pollers can never send
    // the same batch. A stale lock (crashed worker) can be taken over.
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
    const locked = await WhatsappBroadcastJob.findOneAndUpdate(
      {
        _id: params.jobId,
        status: 'running',
        $or: [{ processing: { $ne: true } }, { lastProcessedAt: { $lt: staleBefore } }],
      },
      { $set: { processing: true, lastProcessedAt: new Date() } },
      { new: true },
    );

    if (!locked) {
      // Already finished, cancelled, or another worker holds the lock.
      const current = await WhatsappBroadcastJob.findById(params.jobId).select(SUMMARY_SELECT).lean();
      if (!current) {
        return NextResponse.json({ message: 'Job not found' }, { status: 404, headers: NO_CACHE });
      }
      return NextResponse.json({ job: jobSummary(current), locked: true }, { headers: NO_CACHE });
    }

    try {
      // The slot's key must still be the one this job started with.
      const { apiKey } = await resolveSlotApiKey(locked.slot);
      if (!apiKey || accountFingerprint(apiKey) !== locked.accountFingerprint) {
        locked.status = 'failed';
        locked.error = 'API key for this slot was changed or removed mid-broadcast';
        locked.processing = false;
        locked.completedAt = new Date();
        await locked.save();
        return NextResponse.json({ job: jobSummary(locked) }, { headers: NO_CACHE });
      }

      const batchDoc: any = await WhatsappBroadcastJob.findById(params.jobId)
        .select({ recipients: { $slice: [locked.cursor, PROCESS_BATCH_SIZE] } })
        .lean();
      const batch: any[] = batchDoc?.recipients || [];

      if (!batch.length) {
        locked.status = 'completed';
        locked.processing = false;
        locked.completedAt = new Date();
        await locked.save();
        return NextResponse.json({ job: jobSummary(locked) }, { headers: NO_CACHE });
      }

      const client = createZaptickClient(apiKey);
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < batch.length; i++) {
        const recipient = batch[i];

        // Dedup ledger: claim (account, template, phone) BEFORE sending.
        // A duplicate key error means this phone already got this template
        // from this account (this job, a past job, or a concurrent one).
        let ledger: any = null;
        try {
          ledger = await WhatsappBroadcastSend.create({
            accountFingerprint: locked.accountFingerprint,
            templateName: locked.templateName,
            phone: recipient.phone,
            userId: recipient.userId,
            job: locked._id,
            slot: locked.slot,
            status: 'pending',
          });
        } catch (err: any) {
          if (err?.code === 11000) {
            skipped++;
            continue;
          }
          throw err;
        }

        try {
          const result = await client.messages.send({
            phone: recipient.phone,
            templateName: locked.templateName,
            language: locked.templateLanguage || 'en',
            variables: { '1': recipient.name || 'Customer' },
          });
          ledger.status = 'sent';
          ledger.messageId = result?.messageId || '';
          await ledger.save();
          sent++;
        } catch (err: any) {
          ledger.status = 'failed';
          ledger.error = String(err?.message || err).slice(0, 500);
          await ledger.save();
          failed++;
        }

        if (i < batch.length - 1) {
          await sleep(SEND_INTERVAL_MS);
        }
      }

      locked.cursor += batch.length;
      locked.sentCount += sent;
      locked.failedCount += failed;
      locked.skippedCount += skipped;
      locked.lastProcessedAt = new Date();
      locked.processing = false;
      if (locked.cursor >= locked.totalRecipients) {
        locked.status = 'completed';
        locked.completedAt = new Date();
      }
      await locked.save();

      return NextResponse.json({ job: jobSummary(locked) }, { headers: NO_CACHE });
    } catch (err: any) {
      // Release the lock on unexpected errors so the next poll can retry.
      await WhatsappBroadcastJob.updateOne(
        { _id: params.jobId },
        { $set: { processing: false, error: String(err?.message || err).slice(0, 500) } },
      );
      throw err;
    }
  } catch (error: any) {
    console.error('[WA-BROADCAST][JOB][POST]', error);
    return NextResponse.json({ message: error.message || 'Failed to process job' }, { status: 500, headers: NO_CACHE });
  }
}
