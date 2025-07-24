// models/IPStock.js
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
  // Add tags field
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  memoryOptions: {
    type: Map,
    of: new mongoose.Schema({
      price: Number
    }, { _id: false })
  },
  promoCodes: [{
    code: { type: String, required: true },
    discount: { type: Number, required: true, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }]
})

module.exports = mongoose.models.IPStock || mongoose.model('IPStock', IPStockSchema)