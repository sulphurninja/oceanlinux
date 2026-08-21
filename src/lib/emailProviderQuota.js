/**
 * Tracks daily Resend usage in MongoDB (IST calendar day).
 * Used when EMAIL_STRATEGY=resend-quota so we send up to RESEND_DAILY_LIMIT
 * via Resend, then overflow goes to ZeptoMail.
 */

const mongoose = require('mongoose');

const quotaSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    date: { type: String, required: true },
    count: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'emaildailyquotas' }
);

quotaSchema.index({ provider: 1, date: 1 }, { unique: true });

let connPromise = null;

function getModel() {
  return mongoose.models.EmailDailyQuota || mongoose.model('EmailDailyQuota', quotaSchema);
}

async function ensureConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!connPromise) {
    const url = process.env.MONGOOSE_URL?.trim().replace(/^['"]|['"]$/g, '');
    if (!url) throw new Error('MONGOOSE_URL not configured');

    connPromise = mongoose.connect(url, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
    });
  }

  await connPromise;
}

function getTodayDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getResendDailyLimit() {
  const parsed = parseInt(process.env.RESEND_DAILY_LIMIT || '190', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 190;
}

function resendFilter(date = getTodayDateKey()) {
  return { provider: 'resend', date };
}

async function getResendQuotaStatus() {
  await ensureConnection();
  const date = getTodayDateKey();
  const limit = getResendDailyLimit();
  const doc = await getModel().findOne(resendFilter(date)).lean();
  const count = doc?.count || 0;

  return {
    date,
    provider: 'resend',
    count,
    limit,
    remaining: Math.max(0, limit - count),
    exhausted: count >= limit,
  };
}

/** Atomically reserve one Resend slot for today. Returns false when daily cap reached. */
async function reserveResendSlot() {
  await ensureConnection();
  const date = getTodayDateKey();
  const limit = getResendDailyLimit();
  const filter = { ...resendFilter(date), count: { $lt: limit } };

  const doc = await getModel().findOneAndUpdate(
    filter,
    {
      $inc: { count: 1 },
      $set: { updatedAt: new Date() },
      $setOnInsert: { provider: 'resend', date },
    },
    { upsert: true, new: true }
  );

  return !!(doc && doc.count <= limit);
}

/** Release a reserved slot when Resend send fails after reserve. */
async function releaseResendSlot() {
  await ensureConnection();
  await getModel().findOneAndUpdate(
    { ...resendFilter(), count: { $gt: 0 } },
    { $inc: { count: -1 }, $set: { updatedAt: new Date() } }
  );
}

async function canUseResendToday() {
  const status = await getResendQuotaStatus();
  return status.remaining > 0;
}

/** Skip further Resend attempts today (e.g. monthly quota exhausted). */
async function exhaustResendForToday(reason = 'exhausted') {
  await ensureConnection();
  const date = getTodayDateKey();
  const limit = getResendDailyLimit();

  await getModel().findOneAndUpdate(
    resendFilter(date),
    {
      $set: { count: limit, updatedAt: new Date(), exhaustedReason: reason },
      $setOnInsert: { provider: 'resend', date },
    },
    { upsert: true }
  );
}

function isResendMonthlyQuotaError(message = '') {
  return /monthly email sending quota/i.test(String(message));
}

module.exports = {
  getTodayDateKey,
  getResendDailyLimit,
  getResendQuotaStatus,
  reserveResendSlot,
  releaseResendSlot,
  canUseResendToday,
  exhaustResendForToday,
  isResendMonthlyQuotaError,
};
