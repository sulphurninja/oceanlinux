const mongoose = require('mongoose')

const IPStockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  available: { type: Boolean, default: true },
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
