// models/IPStock.js
const mongoose = require('mongoose')

const IPStockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  available: { type: Boolean, default: true },
  memoryOptions: {
    type: Map,
    of: new mongoose.Schema({
      price: Number
    }, { _id: false })
  },
  // Add promo codes array
  promoCodes: [{
    code: { type: String, required: true },
    discount: { type: Number, required: true, min: 0, max: 100 }, // Percentage discount
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }]
})

module.exports = mongoose.models.IPStock || mongoose.model('IPStock', IPStockSchema)