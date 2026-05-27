import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productName: { type: String, required: true },
    memory: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    promoCode: { type: String },
    promoDiscount: { type: Number, default: 0 },
    ipStockId: { type: String },
    slotIpPackageId: { type: String },
    slotIpId: { type: String },
    transactionId: { type: String, default: '' },
    status: { type: String, default: 'pending' },
    ipAddress: { type: String, default: '' },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    os: {
        type: String,
        enum: ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'],
        default: 'Ubuntu 22'
    },
    clientTxnId: { type: String, required: true, unique: true },
    gatewayOrderId: { type: String },
    expiryDate: { type: Date },

    // Customer info from payment
    customerName: { type: String },
    customerEmail: { type: String },

    // Webhook data
    webhookAmount: { type: String },
    webhookCustomerName: { type: String },
    webhookCustomerEmail: { type: String },

    // Provider identification
    provider: {
        type: String,
        enum: ['hostycare', 'smartvps', 'slotip', 'advps'],
        default: 'hostycare'
    },

    // Hostycare integration fields
    hostycareServiceId: { type: String },
    hostycareProductId: { type: String },

    // SmartVPS integration fields
    smartvpsServiceId: { type: String },
    smartvpsProductId: { type: String },

    // ADVPS integration fields
    advpsServiceId: { type: String },
    advpsProductId: { type: String },
    advpsOrderId: { type: String },

    // ADVPS rebuild/format rate-limiting (max 10 per calendar month)
    advpsRebuildCount: { type: Number, default: 0 },
    advpsRebuildCountMonth: { type: String, default: '' }, // "YYYY-MM" of the current window

    provisioningStatus: {
        type: String,
        enum: ['pending', 'provisioning', 'active', 'failed', 'suspended', 'terminated'],
        default: 'pending'
    },
    provisioningError: { type: String, default: '' },
    autoProvisioned: { type: Boolean, default: false },
    lastProvisionAttempt: { type: Date }, // Track when last provisioning was attempted
    paymentMethod: { type: String }, // upi, cashfree, razorpay
    paymentDetails: { type: mongoose.Schema.Types.Mixed }, // Store payment-specific details

    // VPS Management tracking fields
    lastAction: { type: String }, // 'start', 'stop', 'reboot', 'changepassword', 'reinstall', 'format', 'renew'
    lastActionTime: { type: Date },
    lastSyncTime: { type: Date },
    serverDetails: {
        lastUpdated: { type: Date },
        rawDetails: { type: mongoose.Schema.Types.Mixed },
        rawInfo: { type: mongoose.Schema.Types.Mixed }
    },

    // Renewal tracking
    renewalPayments: [{
        paymentId: { type: String, required: true },
        amount: { type: Number, required: true },
        paidAt: { type: Date, required: true },
        previousExpiry: { type: Date, required: true },
        newExpiry: { type: Date, required: true },
        renewalTxnId: { type: String, required: true }
    }],

    // Pending renewal tracking - stores the current renewal transaction awaiting payment
    pendingRenewal: {
        renewalTxnId: { type: String },
        initiatedAt: { type: Date },
        paymentMethod: { type: String },
        amount: { type: Number },
        gatewayOrderId: { type: String }, // Razorpay order ID if applicable
        // Set when the renewal payment has been confirmed but the linked
        // company has to approve it before the expiry is extended.
        awaitingCompanyApproval: { type: Boolean, default: false },
        renewalRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RenewalRequest' },
        paymentConfirmedAt: { type: Date }
    },

    // Reseller Tracking
    resellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reseller',
        index: true
    },

    // Financial Tracking for Resellers
    pricing: {
        basePrice: Number,      // Cost price (OceanLinux price)
        resellerPrice: Number,  // Price charged to reseller (base + markup)
        customerPrice: Number,  // End customer price (if known)
        markup: Number          // Your margin
    },

    // Wallet Deduction Tracking
    walletDeduction: {
        deducted: { type: Boolean, default: false },
        amount: Number,
        transactionId: String,
        timestamp: Date
    },

    // Panel access credentials (auto-generated on provisioning)
    panelUsername: { type: String, unique: true, sparse: true },
    panelPassword: { type: String },

    // API Order Tracking
    apiOrderId: String,  // Reseller's order ID
    apiMetadata: mongoose.Schema.Types.Mixed,

    // Cart checkout linkage (null/undefined for single Buy Now orders).
    // When set, this order was created as part of a multi-item cart checkout
    // backed by a CheckoutSession document. Webhooks dispatch on the session
    // first and fan out to every order that shares this id.
    checkoutSessionId: { type: String, index: true },
    parentTxnId: { type: String, index: true }
}, { timestamps: true });

// Indexes
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1 });
orderSchema.index({ hostycareServiceId: 1 });
orderSchema.index({ smartvpsServiceId: 1 });
orderSchema.index({ advpsServiceId: 1 });
orderSchema.index({ lastSyncTime: -1 });
orderSchema.index({ expiryDate: 1 });
orderSchema.index({ provider: 1 });
orderSchema.index({ 'pendingRenewal.renewalTxnId': 1 }); // For webhook lookup
orderSchema.index({ 'renewalPayments.renewalTxnId': 1 }); // For idempotency check
orderSchema.index({ panelUsername: 1 });

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
