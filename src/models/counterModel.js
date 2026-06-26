import mongoose from 'mongoose';

// Atomic, named auto-increment counters. Used to mint sequential invoice
// numbers (key: 'invoiceNumber') without collisions across concurrent requests.
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

export default mongoose.models.Counter || mongoose.model('Counter', counterSchema);
