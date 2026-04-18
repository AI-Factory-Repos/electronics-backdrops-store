const mongoose = require('mongoose');

const productVariantSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID is required']
  },
  size: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    trim: true
  },
  techSpecs: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  sku: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  priceModifier: {
    type: Number,
    default: 0
  },
  images: [{ type: String }],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productVariantSchema.index({ productId: 1 });
productVariantSchema.index({ productId: 1, size: 1, color: 1 });

module.exports = mongoose.model('ProductVariant', productVariantSchema);
