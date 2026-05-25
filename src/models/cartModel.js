import mongoose from 'mongoose';

/**
 * Server-persisted shopping cart for end-user (customer) accounts.
 *
 * One cart per user (`user` is unique). Each item references either a
 * regular `IPStock` purchase (with a `memory` option) or a `SlotIPPackage`
 * purchase. Quantity > 1 spawns N independent Order documents at checkout
 * time — there is no concept of "qty 3 on the order" in `orderModel`.
 *
 * The actual price is NOT stored on the cart line. Pricing is recomputed
 * server-side at every GET and at checkout-initiate against live IPStock /
 * SlotIPPackage state, so promo expirations / availability changes / admin
 * price edits are always honored.
 */
const cartItemSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['ipstock', 'slotip'],
    required: true,
  },
  ipStockId: { type: mongoose.Schema.Types.ObjectId, ref: 'IPStock' },
  slotIpPackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SlotIPPackage' },

  // For 'ipstock' lines this is the key into `ipStock.memoryOptions`.
  // For 'slotip' lines this is just a label and is forced to 'Slot IP'.
  memory: { type: String, default: '' },
  os: {
    type: String,
    enum: ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'],
    default: 'Ubuntu 22',
  },
  quantity: { type: Number, default: 1, min: 1, max: 10 },
  promoCode: { type: String, default: '' },
  addedAt: { type: Date, default: Date.now },
}, { _id: true });

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  items: { type: [cartItemSchema], default: [] },
}, { timestamps: true });

export default mongoose.models.Cart || mongoose.model('Cart', cartSchema);
