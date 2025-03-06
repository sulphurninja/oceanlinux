import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productName: { type: String, required: true },
    memory: { type: String, required: true },
    price: { type: Number, required: true },
    transactionId: { type: String, default: '' },
    status: { type: String, default: 'pending' },
    ipAddress: { type: String, default: '' }, // Optional, to be filled by admin
    username: { type: String, default: '' },  // Optional, to be filled by admin
    password: { type: String, default: '' },  // Optional, to be filled by admin
    os: {
        type: String,
        enum: ['CentOS 7', 'Ubuntu 22'],
        default: 'CentOS 7' // Default OS
    }
}, { timestamps: true }); // ✅ Automatically adds `createdAt` & `updatedAt`

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
