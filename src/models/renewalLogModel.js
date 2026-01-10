import mongoose from 'mongoose';

const renewalLogSchema = new mongoose.Schema({
    // Core identifiers
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    renewalTxnId: {
        type: String,
        required: true,
        index: true
    },

    // Order context (for quick reference without populating)
    orderContext: {
        productName: String,
        provider: String,
        ipAddress: String,
        memory: String,
        price: Number,
        currentExpiry: Date,
        hostycareServiceId: String,
        smartvpsServiceId: String
    },

    // Timing information
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    duration: { type: Number }, // milliseconds

    // Status
    success: { type: Boolean, required: true, index: true },
    processedVia: {
        type: String,
        enum: ['webhook', 'confirm-api', 'manual'],
        required: true
    },

    // Payment info
    paymentInfo: {
        paymentMethod: String,
        paymentId: String,
        amount: Number
    },

    // Log entries (array of timestamped log messages)
    logs: [{
        timestamp: { type: Date, required: true },
        level: {
            type: String,
            enum: ['info', 'success', 'error', 'warning', 'debug'],
            required: true
        },
        message: { type: String, required: true },
        data: { type: mongoose.Schema.Types.Mixed } // Additional context data
    }],

    // Provider API results
    providerApiResult: {
        provider: String,
        apiCalled: { type: Boolean, default: false },
        success: { type: Boolean },
        result: { type: mongoose.Schema.Types.Mixed },
        error: { type: mongoose.Schema.Types.Mixed },
        apiDuration: { type: Number } // milliseconds
    },

    // Final result
    newExpiryDate: { type: Date },
    errorMessage: { type: String },
    errorStack: { type: String }

}, { timestamps: true });

// Indexes for efficient querying
renewalLogSchema.index({ createdAt: -1 });
renewalLogSchema.index({ success: 1, createdAt: -1 });
renewalLogSchema.index({ 'orderContext.provider': 1 });
renewalLogSchema.index({ startTime: -1 });

export default mongoose.models.RenewalLog || mongoose.model('RenewalLog', renewalLogSchema);
