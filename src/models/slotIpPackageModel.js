const mongoose = require('mongoose');

const SlotIPSchema = new mongoose.Schema({
  proxy: { type: String, required: true }, // full string: ip:port:user:pass
  ip: { type: String, required: true },
  port: { type: Number, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  allocated: { type: Boolean, default: false },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  allocatedAt: { type: Date, default: null },
}, { _id: true });

const SlotIPPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  available: { type: Boolean, default: true },
  ips: [SlotIPSchema],
  promoCodes: [{
    code: { type: String, required: true },
    discount: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

SlotIPPackageSchema.virtual('totalCount').get(function () {
  return this.ips ? this.ips.length : 0;
});

SlotIPPackageSchema.virtual('availableCount').get(function () {
  return this.ips ? this.ips.filter(ip => !ip.allocated).length : 0;
});

SlotIPPackageSchema.virtual('allocatedCount').get(function () {
  return this.ips ? this.ips.filter(ip => ip.allocated).length : 0;
});

SlotIPPackageSchema.set('toJSON', { virtuals: true });
SlotIPPackageSchema.set('toObject', { virtuals: true });

SlotIPPackageSchema.index({ available: 1 });
SlotIPPackageSchema.index({ 'ips.allocated': 1 });
SlotIPPackageSchema.index({ 'ips.orderId': 1 });

module.exports = mongoose.models.SlotIPPackage || mongoose.model('SlotIPPackage', SlotIPPackageSchema);
