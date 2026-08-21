import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const resellerSchema = new mongoose.Schema({
    // Basic Info
    businessName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed
    phone: String,

    // API Credentials
    apiKey: { type: String, unique: true, sparse: true },
    apiSecret: { type: String }, // Hashed

    // Wallet System
    wallet: {
        balance: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' },
        minBalance: { type: Number, default: 1000 },
        creditLimit: { type: Number, default: 0 }, // Allow negative balance
        transactions: [{
            type: { type: String, enum: ['recharge', 'deduction', 'refund', 'adjustment'] },
            amount: Number,
            previousBalance: Number,
            newBalance: Number,
            orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
            description: String,
            metadata: mongoose.Schema.Types.Mixed,
            createdAt: { type: Date, default: Date.now }
        }]
    },

    // Custom Pricing (YOU set markups per reseller)
    pricing: {
        // Per-product custom prices (key: ipStockId, value: price)
        customPrices: {
            type: Map,
            of: Number
        },

        // Or global markup
        globalMarkup: {
            enabled: { type: Boolean, default: false },
            type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
            value: { type: Number, default: 0 }
        }
    },

    // Status & Settings
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'pending' },
    isVerified: { type: Boolean, default: false },

    // Related User Account (for logging in to dashboard)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Whitelabel Settings (for Phase 2)
    whitelabel: {
        enabled: { type: Boolean, default: false },
        customDomain: String,
        branding: {
            logo: String,
            primaryColor: String,
            companyName: String
        }
    },

    // Stats
    stats: {
        totalOrders: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        totalRecharge: { type: Number, default: 0 }
    },

    // API Usage
    apiUsage: {
        lastRequest: Date,
        requestCount: { type: Number, default: 0 },
        rateLimit: { type: Number, default: 100 } // requests per minute
    },

}, { timestamps: true });

// Password hashing middleware
resellerSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Helper to check password
resellerSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const Reseller = mongoose.models.Reseller || mongoose.model('Reseller', resellerSchema);

export default Reseller;
