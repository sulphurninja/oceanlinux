import mongoose from 'mongoose';

/**
 * One row per "user is topping up their wallet" attempt. Lives in its own
 * collection so wallet top-ups never pollute order listings, dashboard
 * stats, provisioning queries, or admin order pages.
 *
 * Lifecycle:
 *   pending     → recharge initiated, gateway order created, awaiting payment
 *   confirmed   → gateway success, wallet credited, `creditedAt` + `walletTxnId` set
 *   failed      → gateway failure / verification failed
 *   refunded    → reserved for future use (rare — wallet credits aren't typically reversed)
 *
 * Webhook dispatch in `/api/payment/webhook` and `/api/payment/upi-webhook`
 * looks this up by `clientTxnId` BEFORE falling through to `Order` lookup.
 */
const walletRechargeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'INR' },

  clientTxnId: { type: String, required: true, unique: true },

  paymentMethod: {
    type: String,
    enum: ['razorpay', 'cashfree', 'upi'],
    required: true,
  },
  gatewayOrderId: { type: String, default: '' },
  transactionId: { type: String, default: '' },
  paymentDetails: { type: mongoose.Schema.Types.Mixed },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'refunded'],
    default: 'pending',
    index: true,
  },
  failureReason: { type: String, default: '' },

  // Set when the wallet credit lands (paired with `walletTxnId` so we can
  // reconcile back to the exact `wallet.transactions[]` subdoc).
  creditedAt: { type: Date },
  walletTxnId: { type: String, default: '' },
}, { timestamps: true });

walletRechargeSchema.index({ user: 1, status: 1, createdAt: -1 });

export default mongoose.models.WalletRecharge ||
  mongoose.model('WalletRecharge', walletRechargeSchema);
