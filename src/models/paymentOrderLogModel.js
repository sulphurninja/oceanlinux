import mongoose from 'mongoose';

const paymentOrderLogSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    clientTxnId: {
      type: String,
      index: true,
    },
    flowType: {
      type: String,
      enum: ['new_order', 'renewal', 'checkout', 'recharge', 'unknown'],
      default: 'new_order',
    },
    source: {
      type: String,
      enum: ['webhook', 'status-api', 'callback', 'confirm-api', 'recover-api', 'cancel-api', 'manual', 'scan', 'create'],
      required: true,
      index: true,
    },
    success: { type: Boolean, required: true, index: true },
    /** Gateway paid but order stayed pending / confirm failed */
    anomaly: { type: Boolean, default: false, index: true },
    orderContext: {
      productName: String,
      memory: String,
      price: Number,
      status: String,
      provisioningStatus: String,
      userId: mongoose.Schema.Types.ObjectId,
      provider: String,
    },
    paymentInfo: {
      method: String,
      gatewayStatus: String,
      transactionId: String,
      gatewayOrderId: String,
      amount: Number,
    },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    duration: { type: Number },
    logs: [
      {
        timestamp: { type: Date, required: true },
        level: {
          type: String,
          enum: ['info', 'success', 'error', 'warning', 'debug'],
          required: true,
        },
        message: { type: String, required: true },
        data: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    errorMessage: { type: String },
    errorStack: { type: String },
  },
  { timestamps: true }
);

paymentOrderLogSchema.index({ createdAt: -1 });
paymentOrderLogSchema.index({ anomaly: 1, createdAt: -1 });
paymentOrderLogSchema.index({ success: 1, createdAt: -1 });

export default mongoose.models.PaymentOrderLog ||
  mongoose.model('PaymentOrderLog', paymentOrderLogSchema);
