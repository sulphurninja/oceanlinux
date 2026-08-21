import mongoose from 'mongoose';

const serverActionRequestSchema = new mongoose.Schema({
    // Order and user references
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Action details
    action: {
        type: String,
        required: true,
        enum: ['start', 'stop', 'restart', 'format', 'changepassword', 'reinstall']
    },

    // Request status
    status: {
        type: String,
        required: true,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: 'pending',
        index: true
    },

    // Timestamps
    requestedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    processedAt: {
        type: Date
    },

    // Admin processing
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    adminNotes: {
        type: String
    },

    // Additional payload for actions (e.g., new password, template ID)
    payload: {
        type: mongoose.Schema.Types.Mixed
    },

    // Order snapshot for admin reference
    orderSnapshot: {
        productName: String,
        ipAddress: String,
        customerEmail: String,
        customerName: String,
        os: String,
        memory: String
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
serverActionRequestSchema.index({ orderId: 1, status: 1 });
serverActionRequestSchema.index({ status: 1, requestedAt: -1 });
serverActionRequestSchema.index({ userId: 1, status: 1 });

// Prevent duplicate pending requests for same order+action
serverActionRequestSchema.index(
    { orderId: 1, action: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending' }
    }
);

const ServerActionRequest = mongoose.models.ServerActionRequest ||
    mongoose.model('ServerActionRequest', serverActionRequestSchema);

export default ServerActionRequest;
