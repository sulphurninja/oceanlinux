import {
  WhatsappBroadcastJob,
  WhatsappBroadcastSend,
} from '@/models/whatsappBroadcastModel';
import {
  PROCESS_WAVE_SIZE,
  SEND_CONCURRENCY,
  STALE_LOCK_MS,
  accountFingerprint,
  createZaptickClient,
  greetingName,
  resolveSlotApiKey,
} from '@/lib/whatsappBroadcast';

const SUMMARY_SELECT =
  'slot accountLabel maskedKey templateName templateLanguage audience status totalRecipients cursor sentCount failedCount skippedCount error createdAt completedAt processing lastProcessedAt';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function broadcastJobSummary(job) {
  if (!job) return null;
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

async function loadSummary(jobId) {
  const job = await WhatsappBroadcastJob.findById(jobId).select(SUMMARY_SELECT).lean();
  return broadcastJobSummary(job);
}

/**
 * Send the next slice of a running broadcast.
 * Holds the job lock until `timeBudgetMs` elapses, the list is finished, or the job is cancelled.
 * If another worker holds the lock, waits and retries until the budget runs out.
 */
export async function processBroadcastJob(jobId, { timeBudgetMs = 12_000, waitForLock = false } = {}) {
  const deadline = Date.now() + timeBudgetMs;

  while (Date.now() < deadline) {
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
    const locked = await WhatsappBroadcastJob.findOneAndUpdate(
      {
        _id: jobId,
        status: 'running',
        $or: [{ processing: { $ne: true } }, { lastProcessedAt: { $lt: staleBefore } }],
      },
      { $set: { processing: true, lastProcessedAt: new Date() } },
      { new: true },
    );

    if (!locked) {
      const current = await WhatsappBroadcastJob.findById(jobId).select('status').lean();
      if (!current || current.status !== 'running') {
        return { job: await loadSummary(jobId), locked: false };
      }
      if (!waitForLock) {
        return { job: await loadSummary(jobId), locked: true };
      }
      await sleep(2000);
      continue;
    }

    try {
      const { apiKey } = await resolveSlotApiKey(locked.slot);
      if (!apiKey || accountFingerprint(apiKey) !== locked.accountFingerprint) {
        await WhatsappBroadcastJob.updateOne(
          { _id: jobId },
          {
            $set: {
              status: 'failed',
              error: 'API key for this slot was changed or removed mid-broadcast',
              processing: false,
              completedAt: new Date(),
            },
          },
        );
        return { job: await loadSummary(jobId), locked: false };
      }

      const client = createZaptickClient(apiKey);

      const sendOne = async (recipient) => {
        let ledger = null;
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
        } catch (err) {
          if (err?.code === 11000) return 'skipped';
          throw err;
        }

        const payload = {
          phone: recipient.phone,
          templateName: locked.templateName,
          language: locked.templateLanguage || 'en',
          variables: { '1': greetingName(recipient.name) },
        };

        try {
          let result;
          try {
            result = await client.messages.send(payload);
          } catch (err) {
            if (err?.status === 429) {
              await sleep(Math.min((Number(err.retryAfter) || 1) * 1000, 3000));
              result = await client.messages.send(payload);
            } else {
              throw err;
            }
          }
          await WhatsappBroadcastSend.updateOne(
            { _id: ledger._id },
            { $set: { status: 'sent', messageId: result?.messageId || '' } },
          );
          return 'sent';
        } catch (err) {
          await WhatsappBroadcastSend.updateOne(
            { _id: ledger._id },
            { $set: { status: 'failed', error: String(err?.message || err).slice(0, 500) } },
          );
          return 'failed';
        }
      };

      while (Date.now() < deadline) {
        const state = await WhatsappBroadcastJob.findById(jobId)
          .select('status cursor totalRecipients')
          .lean();
        if (!state || state.status !== 'running') break;

        const batchDoc = await WhatsappBroadcastJob.findById(jobId)
          .select({ recipients: { $slice: [state.cursor, PROCESS_WAVE_SIZE] } })
          .lean();
        const batch = batchDoc?.recipients || [];
        if (!batch.length) break;

        const outcomes = await mapPool(batch, SEND_CONCURRENCY, sendOne);
        const sent = outcomes.filter((o) => o === 'sent').length;
        const failed = outcomes.filter((o) => o === 'failed').length;
        const skipped = outcomes.filter((o) => o === 'skipped').length;

        await WhatsappBroadcastJob.updateOne(
          { _id: jobId },
          {
            $inc: {
              cursor: batch.length,
              sentCount: sent,
              failedCount: failed,
              skippedCount: skipped,
            },
            $set: { lastProcessedAt: new Date(), processing: true },
          },
        );
      }
    } catch (err) {
      await WhatsappBroadcastJob.updateOne(
        { _id: jobId },
        { $set: { processing: false, error: String(err?.message || err).slice(0, 500) } },
      );
      throw err;
    }

    const finalState = await WhatsappBroadcastJob.findById(jobId).select('status cursor totalRecipients').lean();
    const done = !finalState || finalState.cursor >= finalState.totalRecipients;
    const patch = { processing: false, lastProcessedAt: new Date() };
    if (finalState?.status === 'running' && done) {
      patch.status = 'completed';
      patch.completedAt = new Date();
    }
    await WhatsappBroadcastJob.updateOne({ _id: jobId }, { $set: patch });

    if (!finalState || finalState.status !== 'running' || done) {
      return { job: await loadSummary(jobId), locked: false };
    }
  }

  return { job: await loadSummary(jobId), locked: false };
}
