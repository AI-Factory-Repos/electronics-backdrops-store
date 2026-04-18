const mongoose = require('mongoose');

const productVariantSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  size: { type: String, default: '' },
  color: { type: String, default: '' },
  techSpecs: { type: mongoose.Schema.Types.Mixed, default: {} },
  stock: { type: Number, required: true, min: 0, default: 0 },
  sku: { type: String, trim: true },
  priceModifier: { type: Number, default: 0 }
}, { timestamps: true });

productVariantSchema.index({ productId: 1 });

module.exports = mongoose.model('ProductVariant', productVariantSchema);
