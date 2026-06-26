import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        default: ''
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
        default: null
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
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
    // Billing address — required for GST-compliant invoices (determines
    // CGST+SGST for intra-state vs IGST for inter-state supply).
    billingAddress: {
        line: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        country: { type: String, default: 'India' },
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
    // Reseller Integration
    resellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reseller',
        default: null
    },
    userType: {
        type: String,
        enum: ['customer', 'reseller', 'admin'],
        default: 'customer'
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
