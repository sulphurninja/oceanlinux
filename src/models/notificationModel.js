import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'order_created',
            'order_confirmed',
            'order_provisioning',
            'order_completed',
            'order_failed',
            'ticket_created',
            'ticket_updated',
            'ticket_replied',
            'ticket_resolved',
            'announcement',
            'payment_success',
            'payment_failed',
            'server_action',
            'profile_updated',
            'login_new_device'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed, // Additional data like order ID, ticket ID, etc.
        default: {}
    },
    read: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    actionUrl: {
        type: String // URL to navigate when notification is clicked
    },
    icon: {
        type: String,
        default: 'bell'
    }
}, {
    timestamps: true
});

// Indexes for performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ type: 1 });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
