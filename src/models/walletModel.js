import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['credit', 'debit', 'refund', 'bonus'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    reference: {
        type: String, // Order ID, Payment ID, etc.
    },
    balanceBefore: {
        type: Number,
        required: true
    },
    balanceAfter: {
        type: Number,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    transactions: [walletTransactionSchema],
    totalCredits: {
        type: Number,
        default: 0
    },
    totalDebits: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for faster queries
walletSchema.index({ userId: 1 });
walletSchema.index({ 'transactions.createdAt': -1 });

const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);

export default Wallet;
