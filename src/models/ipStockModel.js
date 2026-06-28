const mongoose = require('mongoose')

const IPStockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  available: { type: Boolean, default: true },
  /** Units remaining for company-managed stock. Only enforced when `company` is set. */
  stockCount: { type: Number, default: 0, min: 0 },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  /** Pre-configured servers — auto-assigned on payment (like slot IPs). */
  inventoryItems: [{
    ipAddress: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    os: {
      type: String,
      enum: ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'],
      default: 'Windows 2022 64',
    },
    allocated: { type: Boolean, default: false },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    allocatedAt: { type: Date, default: null },
    /** When this row was added to inventory (for company activity stats). */
    addedAt: { type: Date, default: Date.now },
    /** Optional — synced from Hostheaven `expiresAt` when adding inventory. */
    expiryDate: { type: Date, default: null },
  }],
  serverType: {
    type: String,
    enum: ['VPS', 'Linux'],
    required: true,
    default: 'Linux'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  memoryOptions: {
    type: Map,
    of: new mongoose.Schema({
      price: Number,
      // Map each memory option to a Hostycare product ID
      hostycareProductId: { type: String }, // e.g., "1", "2", "3"
      hostycareProductName: { type: String } // Optional: for reference
    }, { _id: false })
  },
  promoCodes: [{
    code: { type: String, required: true },
    discount: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }],

  // Default configurations for this IP stock when ordering from Hostycare
  defaultConfigurations: {
    type: Map,
    of: mongoose.Schema.Types.Mixed, // Flexible for various config options
    default: {}
  }
})

module.exports = mongoose.models.IPStock || mongoose.model('IPStock', IPStockSchema)
