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
    showAsLoginPopup: {
        type: Boolean,
        default: false
    },
    communityLink: {
        type: String,
        default: ''
    },
    targetAudience: {
        type: String,
        enum: ['all', 'customers', 'new-users', 'premium'],
        default: 'all'
    },
    showOnOrderPage: {
        type: Boolean,
        default: false
    },
    targetProvider: {
        type: String,
        default: null
    },
    targetCompany: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    sentCount: {
        type: Number,
        default: 0
    },
    emailsFailed: {
        type: Number,
        default: 0
    },
    notificationCount: {
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
announcementSchema.index({ status: 1, showOnOrderPage: 1, targetProvider: 1 });
announcementSchema.index({ status: 1, showOnOrderPage: 1, targetCompany: 1 });

// Next.js hot-reload can cache an old schema — re-register when new paths were added.
if (mongoose.models.Announcement && !mongoose.models.Announcement.schema.paths.targetCompany) {
  delete mongoose.models.Announcement;
}

export default mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
