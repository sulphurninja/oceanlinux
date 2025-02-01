// models/orderModel.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productName: { type: String, required: true },
    memory: { type: String, required: true },
    price: { type: Number, required: true },
    paymentId: { type: String, required: true },
    status: { type: String, default: 'pending' },
    username: { type: String, default: '' },  // Optional, to be filled by admin
    password: { type: String, default: '' }   // Optional, to be filled by admin
});

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
