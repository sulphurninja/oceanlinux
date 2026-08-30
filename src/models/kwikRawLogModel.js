import mongoose from 'mongoose';

/**
 * Raw KwikUPI payloads captured verbatim.
 *
 * KwikUPI's status API reports the *requested* order amount, not the amount that
 * actually landed in the merchant account, so partial payments (e.g. ₹1 against a
 * ₹1249 order) pass our amount check. These logs let us compare what the webhook
 * reports against what the status API reports for the same payment.
 */
const kwikRawLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ['webhook', 'status-api', 'create'],
      required: true,
      index: true,
    },
    paymentId: { type: String, default: '', index: true },
    orderId: { type: String, default: '', index: true },
    reportedStatus: { type: String, default: '' },
    reportedAmount: { type: Number, default: null },
    expectedAmount: { type: Number, default: null },
    amountMatches: { type: Boolean, default: null },
    signatureValid: { type: Boolean, default: null },
    headers: { type: mongoose.Schema.Types.Mixed, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// Diagnostic data only — drop after 30 days so the collection cannot grow forever.
kwikRawLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const KwikRawLog =
  mongoose.models.KwikRawLog || mongoose.model('KwikRawLog', kwikRawLogSchema);

export default KwikRawLog;
