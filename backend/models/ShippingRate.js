const mongoose = require('mongoose');

const shippingRateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Shipping rate name is required'],
    trim: true
  },
  carrier: {
    type: String,
    trim: true
  },
  method: {
    type: String,
    required: [true, 'Shipping method is required'],
    trim: true
  },
  estimatedDays: {
    min: { type: Number, min: 0 },
    max: { type: Number, min: 0 }
  },
  baseRate: {
    type: Number,
    required: [true, 'Base rate is required'],
    min: [0, 'Base rate cannot be negative']
  },
  perItemRate: {
    type: Number,
    default: 0,
    min: [0, 'Per item rate cannot be negative']
  },
  perWeightRate: {
    type: Number,
    default: 0,
    min: [0, 'Per weight rate cannot be negative']
  },
  freeShippingThreshold: {
    type: Number,
    min: [0, 'Free shipping threshold cannot be negative']
  },
  zipCodePatterns: [{ type: String }],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

shippingRateSchema.index({ isActive: 1 });

module.exports = mongoose.model('ShippingRate', shippingRateSchema);
