import mongoose from 'mongoose';

const apiKeySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    key: {
        type: String,
        required: true,
        unique: true
    },
    permissions: [{
        type: String,
        required: true
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: {
        type: Date
    },
    expiresAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for faster queries
apiKeySchema.index({ userId: 1, isActive: 1 });
apiKeySchema.index({ key: 1 });

const APIKey = mongoose.models.APIKey || mongoose.model('APIKey', apiKeySchema);

export default APIKey;
