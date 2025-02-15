// models/IPStock.js
const mongoose = require('mongoose')

const IPStockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" }, // <--- Add this line
  available: { type: Boolean, default: true },
  memoryOptions: {
    type: Map,
    of: new mongoose.Schema({
      price: Number
    }, { _id: false })
  }
})

module.exports = mongoose.models.IPStock || mongoose.model('IPStock', IPStockSchema)
