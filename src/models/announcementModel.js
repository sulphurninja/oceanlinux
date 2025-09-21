import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['promotion', 'update', 'maintenance', 'feature', 'security'],
        default: 'update'
    },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sent', 'cancelled'],
        default: 'draft'
    },
    scheduledFor: {
        type: Date
    },
    actionUrl: {
        type: String
    },
    actionText: {
        type: String
    },
    targetAudience: {
        type: String,
        enum: ['all', 'customers', 'new-users', 'premium'],
        default: 'all'
    },
    sentCount: {
        type: Number,
        default: 0
    },
    openCount: {
        type: Number,
        default: 0
    },
    clickCount: {
        type: Number,
        default: 0
    },
    sentAt: {
        type: Date
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

// Indexes
announcementSchema.index({ status: 1, scheduledFor: 1 });
announcementSchema.index({ createdAt: -1 });

export default mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
