import mongoose from 'mongoose';

/**
 * Parent document for a multi-item cart checkout. Owns N child Order docs
 * (`orderIds[]`) and at most 1 wallet debit (`walletTxnId`) and 1 gateway
 * payment session.
 *
 * Webhook dispatch ([src/app/api/payment/webhook/route.js], [.../upi-webhook])
 * looks this up by `clientTxnId` first, before falling through to
 * WalletRecharge and finally Order. The session.clientTxnId is the gateway
 * order_id; child orders carry it as `parentTxnId`.
 *
 * Lifecycle:
 *   pending    → orders created (status='pending'), wallet debit reserved if any,
 *                gateway order created if shortfall > 0
 *   confirmed  → all child orders marked confirmed, bulkProvision invoked
 *   failed     → gateway declined OR sweep job ran on stale pending session;
 *                wallet reservation refunded, orders marked failed
 *   cancelled  → user explicitly cancelled before payment landed
 */
const checkoutItemSnapshotSchema = new mongoose.Schema({
  kind: { type: String, enum: ['ipstock', 'slotip'], required: true },
  ipStockId: { type: mongoose.Schema.Types.ObjectId, ref: 'IPStock' },
  slotIpPackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SlotIPPackage' },
  productName: { type: String, required: true },
  memory: { type: String, default: '' },
  os: { type: String, default: 'Ubuntu 22' },
  quantity: { type: Number, default: 1 },
  unitOriginalPrice: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  unitDiscount: { type: Number, default: 0 },
  promoCode: { type: String, default: '' },
}, { _id: false });

const checkoutSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  clientTxnId: { type: String, required: true, unique: true },
  gatewayOrderId: { type: String, default: '', index: true },

  paymentMethod: {
    type: String,
    enum: [
      'wallet',
      'razorpay', 'cashfree', 'upi',
      'wallet+razorpay', 'wallet+cashfree', 'wallet+upi',
    ],
    required: true,
  },

  // Money math (integer rupees, matches existing Order.price convention).
  subtotal: { type: Number, required: true },
  promoDiscount: { type: Number, default: 0 },
  walletAmount: { type: Number, default: 0 },
  gatewayAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },

  // Pointer back to the wallet.transactions[] subdoc representing the
  // reservation debit (so we can refund precisely on failure / sweep).
  walletTxnId: { type: String, default: '' },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  failureReason: { type: String, default: '' },

  itemsSnapshot: { type: [checkoutItemSnapshotSchema], default: [] },
  orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],

  customerName: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  customerPhone: { type: String, default: '' },

  // Set when status leaves 'pending'.
  confirmedAt: { type: Date },
  failedAt: { type: Date },
  paymentDetails: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

checkoutSessionSchema.index({ user: 1, status: 1, createdAt: -1 });

export default mongoose.models.CheckoutSession ||
  mongoose.model('CheckoutSession', checkoutSessionSchema);
