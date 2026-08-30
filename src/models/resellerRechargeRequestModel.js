import mongoose from 'mongoose';

/**
 * Reseller wallet top-up via Paytm dynamic QR (auto verify).
 */
const resellerRechargeRequestSchema = new mongoose.Schema(
  {
    reseller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reseller',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },

    method: {
      type: String,
      enum: ['manual_upi', 'auto_upi', 'paytm_qr', 'kwikupi', 'vyapar'],
      required: true,
    },
    clientTxnId: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: [
        'pending_payment',
        'awaiting_approval',
        'processing',
        'confirmed',
        'rejected',
        'failed',
        'expired',
      ],
      default: 'pending_payment',
      index: true,
    },

    upiVpa: { type: String, default: '' },
    payeeName: { type: String, default: '' },
    upiPayload: { type: String, default: '' },
    qrImageUrl: { type: String, default: '' },
    paytmQrCodeId: { type: String, default: '' },
    kwikUpiPaymentId: { type: String, default: '' },

    utr: { type: String, default: '', index: true },
    utrSubmittedAt: { type: Date },

    paymentMethod: { type: String, default: '' },
    gatewayOrderId: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    paymentDetails: { type: mongoose.Schema.Types.Mixed },
    paymentUrl: { type: String, default: '' },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
    adminNote: { type: String, default: '' },

    creditedAt: { type: Date },
    walletTxnId: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

resellerRechargeRequestSchema.index({ reseller: 1, status: 1, createdAt: -1 });
resellerRechargeRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.ResellerRechargeRequest ||
  mongoose.model('ResellerRechargeRequest', resellerRechargeRequestSchema);
