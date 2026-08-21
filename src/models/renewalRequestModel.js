import mongoose from 'mongoose';

/**
 * RenewalRequest
 *
 * Approval queue for renewal payments on **company-managed** orders.
 *
 * For orders whose IPStock is linked to a Company (i.e. Rockybhai-style
 * portal-managed orders without native automation IDs), customers can pay
 * for a renewal but the order's expiry is NOT bumped on payment. Instead a
 * RenewalRequest is created and the company approves it from
 * `/company/[slug]` → Renewals tab. Approval extends `Order.expiryDate`,
 * pushes a `renewalPayments[]` entry and clears the request.
 *
 * Hostycare / SmartVPS / ADVPS / OceanLinux native renewals stay on the
 * existing fast path — they do NOT create a RenewalRequest.
 */
const renewalRequestSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },

  // Unique payment reference — also acts as the idempotency key. Both the
  // webhook and /payment/callback can land here; they de-dupe on this field.
  renewalTxnId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  amount: { type: Number, required: true },
  paymentMethod: {
    type: String,
    enum: ['cashfree', 'razorpay', 'upi'],
    required: true,
  },
  paymentId: { type: String },           // gateway payment id (cf_payment_id / razorpay_payment_id)
  gatewayOrderId: { type: String },      // razorpay order_id or cashfree/upi client_txn_id
  paymentDetails: { type: mongoose.Schema.Types.Mixed },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },

  requestedAt: { type: Date, default: Date.now, index: true },
  processedAt: { type: Date },
  adminNotes: { type: String },

  // Snapshot for the company UI so we don't have to populate Order/User/IPStock.
  orderSnapshot: {
    productName: String,
    ipAddress: String,
    customerEmail: String,
    customerName: String,
    memory: String,
    stockName: String,
  },

  // Pre-computed expiries so the company can see exactly what they're approving.
  renewalSnapshot: {
    previousExpiry: Date,
    proposedNewExpiry: Date,
  },
}, { timestamps: true });

renewalRequestSchema.index({ companyId: 1, status: 1, requestedAt: -1 });
renewalRequestSchema.index({ orderId: 1, status: 1 });

const RenewalRequest = mongoose.models.RenewalRequest ||
  mongoose.model('RenewalRequest', renewalRequestSchema);

export default RenewalRequest;
