import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productName: { type: String, required: true },
    memory: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number }, // For promo code tracking
    promoCode: { type: String }, // Applied promo code
    promoDiscount: { type: Number, default: 0 }, // Discount amount
    ipStockId: { type: String }, // Reference to IP Stock
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

    // Hostycare integration fields
    hostycareServiceId: { type: String },
    hostycareProductId: { type: String },
    provisioningStatus: {
        type: String,
        enum: ['pending', 'provisioning', 'active', 'failed', 'suspended', 'terminated'],
        default: 'pending'
    },
    provisioningError: { type: String, default: '' },
    autoProvisioned: { type: Boolean, default: false },
}, { timestamps: true });

// ✅ add indexes so sort & lookups are fast
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1 });



export default mongoose.models.Order || mongoose.model('Order', orderSchema);
