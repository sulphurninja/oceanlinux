// models/IPStock.js
const mongoose = require('mongoose');

const IPStockSchema = new mongoose.Schema({
    name: { type: String, required: true },
    available: { type: Boolean, default: true },
    memoryOptions: {
        type: Map,
        of: new mongoose.Schema({
            price: Number
        }, { _id: false })
    } // Simplified model based on your provided details
});

module.exports = mongoose.models.IPStock || mongoose.model('IPStock', IPStockSchema);
