const mongoose = require('mongoose');

const TrialVpsSlotSchema = new mongoose.Schema(
  {
    ipAddress: { type: String, required: true },
    /** HTTP proxy port (premium_proxy packages). */
    port: { type: String, default: '' },
    username: { type: String, required: true },
    password: { type: String, required: true },
    os: { type: String, default: 'Ubuntu 22' },
    allocated: { type: Boolean, default: false },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    allocatedAt: { type: Date, default: null },
    soldAt: { type: Date, default: null },
  },
  { _id: true }
);

const TrialVpsPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    /** Trial length delivered to the customer after payment. */
    trialDays: { type: Number, required: true, min: 1, default: 7 },
    /** RAM tier on store for Linux/Windows trial; 0 for premium_proxy. */
    memoryGb: { type: Number, min: 0, default: 4 },
    /** linux | windows | premium_proxy — customer-facing category label. */
    planCategory: {
      type: String,
      enum: ['linux', 'windows', 'premium_proxy'],
      default: 'linux',
    },
    price: { type: Number, required: true, min: 0 },
    available: { type: Boolean, default: true },
    /**
     * Optional IP stock row (SmartVPS tags, Prime/reseller company, Virtualizor, etc.).
     * Trial orders copy this to order.ipStockId so start/stop uses the same APIs as regular plans.
     */
    /** Company portal with Virtualizor / Prime / Netbay / etc. — preferred for trial panel manage. */
    manageCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    /** SmartVPS / ADVPS plans without a company row — optional fallback. */
    manageIpStockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IPStock',
      default: null,
    },
    slots: [TrialVpsSlotSchema],
    promoCodes: [
      {
        code: { type: String, required: true },
        discount: { type: Number, required: true, min: 0 },
        discountType: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
        isActive: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

TrialVpsPackageSchema.virtual('totalCount').get(function () {
  return this.slots ? this.slots.length : 0;
});

TrialVpsPackageSchema.virtual('availableCount').get(function () {
  return this.slots ? this.slots.filter((s) => !s.allocated).length : 0;
});

TrialVpsPackageSchema.virtual('allocatedCount').get(function () {
  return this.slots ? this.slots.filter((s) => s.allocated).length : 0;
});

TrialVpsPackageSchema.set('toJSON', { virtuals: true });
TrialVpsPackageSchema.set('toObject', { virtuals: true });

TrialVpsPackageSchema.index({ available: 1 });
TrialVpsPackageSchema.index({ 'slots.allocated': 1 });

const TRIAL_VPS_MODEL = 'TrialVpsPackage';
const existingTrialVpsModel = mongoose.models[TRIAL_VPS_MODEL];
if (
  existingTrialVpsModel &&
  (!existingTrialVpsModel.schema.paths.planCategory ||
    !existingTrialVpsModel.schema.paths.manageCompanyId ||
    !existingTrialVpsModel.schema.paths.manageIpStockId)
) {
  delete mongoose.models[TRIAL_VPS_MODEL];
}

module.exports =
  mongoose.models[TRIAL_VPS_MODEL] || mongoose.model(TRIAL_VPS_MODEL, TrialVpsPackageSchema);
