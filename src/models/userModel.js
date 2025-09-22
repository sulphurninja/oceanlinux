import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    // Additional profile fields
    avatar: {
        type: String,
        default: ''
    },
    bio: {
        type: String,
        default: ''
    },
    location: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    company: {
        type: String,
        default: ''
    },
    website: {
        type: String,
        default: ''
    },
    socialLinks: {
        github: { type: String, default: '' },
        twitter: { type: String, default: '' },
        linkedin: { type: String, default: '' }
    },
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark', 'system'],
            default: 'system'
        },
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            orderUpdates: { type: Boolean, default: true },
            marketing: { type: Boolean, default: false }
        },
        language: { type: String, default: 'en' },
        timezone: { type: String, default: 'UTC' }
    },
    // Wallet reference
    walletId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet'
    },
    // API usage settings
    apiSettings: {
        monthlyLimit: {
            type: Number,
            default: 1000 // Default API calls per month
        },
        currentMonthUsage: {
            type: Number,
            default: 0
        },
        lastResetDate: {
            type: Date,
            default: Date.now
        }
    },
    // Security settings
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // This adds createdAt and updatedAt fields
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
