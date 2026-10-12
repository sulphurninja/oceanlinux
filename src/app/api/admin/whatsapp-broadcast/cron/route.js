import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { enforceCronSecret } from '@/lib/apiSecurity';
import { WhatsappBroadcastJob } from '@/models/whatsappBroadcastModel';
import { processBroadcastJob } from '@/lib/whatsappBroadcastRunner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

/** Stay under the Lambda's 14 minute HTTP timeout. */
const CRON_BUDGET_MS = 12 * 60 * 1000;

/**
 * Drain every running WhatsApp broadcast. One call sends all slots at once,
 * so the admin page does not need to stay open.
 * Auth: CRON_SECRET via x-cron-secret, Authorization: Bearer, or ?secret=
 */
export async function GET(request) {
  const denied = enforceCronSecret(request);
  if (denied) return denied;

  await connectDB();

  const jobs = await WhatsappBroadcastJob.find({ status: 'running' })
    .select('_id slot templateName')
    .lean();

  if (!jobs.length) {
    return NextResponse.json({
      success: true,
      message: 'No running broadcasts',
      jobs: [],
    });
  }

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const result = await processBroadcastJob(String(job._id), {
          timeBudgetMs: CRON_BUDGET_MS,
          waitForLock: true,
        });
        return { slot: job.slot, templateName: job.templateName, ...result };
      } catch (err) {
        return {
          slot: job.slot,
          templateName: job.templateName,
          jobId: job._id,
          error: err?.message || 'Failed to process broadcast',
        };
      }
    }),
  );

  return NextResponse.json({
    success: true,
    message: `Processed ${jobs.length} running broadcast${jobs.length === 1 ? '' : 's'}`,
    jobs: results,
  });
}
