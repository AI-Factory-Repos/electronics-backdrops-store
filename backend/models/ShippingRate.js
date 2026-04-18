const mongoose = require('mongoose');

const shippingRateSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    enum: ['standard', 'expedited', 'overnight'],
  },
  label: {
    type: String,
    required: true,
  },
  baseRate: {
    type: Number,
    required: true,
  },
  perPoundRate: {
    type: Number,
    required: true,
    default: 0,
  },
  freeShippingThreshold: {
    type: Number,
    default: null,
  },
  estimatedDaysMin: {
    type: Number,
    required: true,
  },
  estimatedDaysMax: {
    type: Number,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('ShippingRate', shippingRateSchema);
