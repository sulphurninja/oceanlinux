import mongoose from 'mongoose';

/**
 * WhatsApp Broadcast workspace models.
 *
 * - WhatsappBroadcastAccount: 7 configurable Zaptick API key slots.
 *   Slot 1 falls back to the platform's default ZAPTICK_API_KEY env key.
 * - WhatsappBroadcastJob: one broadcast run (template + audience + account),
 *   with a snapshotted, deduped recipient list and progress counters.
 * - WhatsappBroadcastSend: permanent dedup ledger. The unique index on
 *   (accountFingerprint, templateName, phone) guarantees the same template
 *   is NEVER sent twice to the same phone from the same Zaptick account,
 *   even across re-runs or concurrent jobs.
 */

const accountSchema = new mongoose.Schema(
  {
    slot: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 7,
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
    // Custom Zaptick API key for this slot. Empty for slot 1 means
    // "use the default env ZAPTICK_API_KEY".
    apiKey: {
      type: String,
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

const recipientSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    name: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema(
  {
    slot: { type: Number, required: true },
    accountLabel: { type: String, default: '' },
    // sha256 fingerprint of the API key actually used — dedup is per real
    // account, even if the same key is configured in multiple slots.
    accountFingerprint: { type: String, required: true, index: true },
    maskedKey: { type: String, default: '' },
    templateName: { type: String, required: true },
    templateLanguage: { type: String, default: 'en' },
    audience: {
      type: String,
      enum: ['purchasers', 'all'],
      required: true,
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'cancelled', 'failed'],
      default: 'running',
      index: true,
    },
    recipients: { type: [recipientSchema], default: [] },
    totalRecipients: { type: Number, default: 0 },
    cursor: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    // Skipped = phone already received this template from this account.
    skippedCount: { type: Number, default: 0 },
    // Simple lock so only one worker processes a batch at a time.
    processing: { type: Boolean, default: false },
    lastProcessedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

jobSchema.index({ createdAt: -1 });

const sendSchema = new mongoose.Schema(
  {
    accountFingerprint: { type: String, required: true },
    templateName: { type: String, required: true },
    phone: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappBroadcastJob' },
    slot: { type: Number },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    messageId: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

// THE dedup guarantee: one (account, template, phone) row, forever.
sendSchema.index(
  { accountFingerprint: 1, templateName: 1, phone: 1 },
  { unique: true },
);

export const WhatsappBroadcastAccount =
  mongoose.models.WhatsappBroadcastAccount ||
  mongoose.model('WhatsappBroadcastAccount', accountSchema);

export const WhatsappBroadcastJob =
  mongoose.models.WhatsappBroadcastJob ||
  mongoose.model('WhatsappBroadcastJob', jobSchema);

export const WhatsappBroadcastSend =
  mongoose.models.WhatsappBroadcastSend ||
  mongoose.model('WhatsappBroadcastSend', sendSchema);
